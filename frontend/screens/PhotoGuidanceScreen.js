/**
 * Photo Guidance Screen - Take guided room photos
 * Supports both camera capture and gallery selection
 *
 * CHANGED (Task 3 / Principle 1 — "one photo should always be enough"):
 * The screen used to require every photo in roomConfig.photoGuidance before
 * Continue was enabled. It now only requires ONE photo. The remaining
 * guidance cards are still shown as optional add-ons — more photos still
 * improve detection quality, they just no longer block the user.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import PhotoCard from '../components/PhotoCard';
import ProgressBar from '../components/ProgressBar';
import { ROOM_TYPES } from '../constants/RoomConfig';

const MINIMUM_PHOTOS_REQUIRED = 1;

export default function PhotoGuidanceScreen({ 
  goToScreen, 
  updateData, 
  appData,
  apiBaseUrl,
  sessionId 
}) {
  const currentRoomType = appData.currentRoom;
  const roomConfig = ROOM_TYPES[currentRoomType];
  const [photos, setPhotos] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Request camera and library permissions
   * @returns {Promise<boolean>} True if permissions granted
   */
  const requestPermissions = async () => {
    try {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (cameraPermission.status !== 'granted' || libraryPermission.status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Camera and photo library permissions are required to capture or select photos.',
          [{ text: 'OK' }]
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('❌ Permission error:', error);
      Alert.alert(
        'Permission Error',
        `Failed to request permissions: ${error.message}`,
        [{ text: 'OK' }]
      );
      return false;
    }
  };

  /**
   * Take photo using camera for specific guidance
   * @param {Object} guidance - Photo guidance object
   */
  const takePhoto = async (guidance) => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      console.log(`📷 Opening camera for ${guidance.label}...`);

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const uri = result.assets[0].uri;
        console.log(`✅ Photo captured for ${guidance.label}: ${uri}`);
        setPhotos(prev => ({
          ...prev,
          [guidance.label]: uri
        }));
      } else {
        console.log('📷 Camera cancelled by user');
      }
    } catch (error) {
      console.error('❌ Camera error:', error);
      Alert.alert(
        'Camera Error',
        `Failed to open camera: ${error.message}\n\nPlease check camera permissions in Settings.`,
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Choose photo from gallery for specific guidance
   * @param {Object} guidance - Photo guidance object
   */
  const chooseFromGallery = async (guidance) => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      console.log(`🖼️  Opening gallery for ${guidance.label}...`);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const uri = result.assets[0].uri;
        console.log(`✅ Photo selected from gallery for ${guidance.label}: ${uri}`);
        setPhotos(prev => ({
          ...prev,
          [guidance.label]: uri
        }));
      } else {
        console.log('🖼️  Gallery selection cancelled by user');
      }
    } catch (error) {
      console.error('❌ Gallery error:', error);
      Alert.alert(
        'Gallery Error',
        `Failed to open gallery: ${error.message}\n\nPlease check photo library permissions in Settings.`,
        [{ text: 'OK' }]
      );
    }
  };

  const photoCount = Object.keys(photos).length;
  // CHANGED: used to be roomConfig.photoGuidance.every(...) — now just needs one.
  const hasMinimumPhoto = photoCount >= MINIMUM_PHOTOS_REQUIRED;

  /**
   * Process photos and detect items in room
   */
  const handleContinue = async () => {
    if (!hasMinimumPhoto) {
      Alert.alert(
        'Photo Required',
        'Please take or select at least one photo to continue.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!sessionId) {
      Alert.alert(
        'Session Error',
        'Session not initialized. Please restart the app.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsProcessing(true);

    try {
      console.log('📤 Uploading photos to backend...');

      // Create FormData
      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('room_type', currentRoomType);

      // Add whichever photos were taken (no longer required to be all of them)
      let imageIndex = 0;
      for (const guidance of roomConfig.photoGuidance) {
        const uri = photos[guidance.label];
        if (uri) {
          const filename = `${guidance.label}.jpg`;
          formData.append(`image${imageIndex}`, {
            uri: uri,
            type: 'image/jpeg',
            name: filename
          });
          imageIndex++;
        }
      }

      console.log(`📤 Uploading ${imageIndex} images for room analysis...`);

      // Send to backend
      const response = await fetch(`${apiBaseUrl}/room/detect-items`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to detect items in room');
      }

      console.log('✅ Items detected:', data.items);

      // Update app state
      updateData({
        roomPhotos: photos,
        detectedItems: data.items,
        currentItemIndex: 0,
        currentItem: data.items[0]
      });

      // Navigate to item selection (verification + multi-select)
      goToScreen('itemSelection');

    } catch (error) {
      console.error('❌ Processing error:', error);
      Alert.alert(
        'Processing Error',
        `Failed to analyze photos: ${error.message}\n\nDetails:\n- Check your internet connection\n- Ensure backend server is running\n- Verify API URL: ${apiBaseUrl}\n\nPlease try again.`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.roomIcon}>{roomConfig.icon}</Text>
          <Text style={styles.title}>{roomConfig.name}</Text>
          <Text style={styles.subtitle}>
            Take or select one wide photo to get started — the rest below are optional
            and help us be more accurate.
          </Text>
        </View>

        <ProgressBar 
          current={photoCount}
          total={roomConfig.photoGuidance.length}
          label="Photos captured (1 needed)"
        />

        <View style={styles.photoGrid}>
          {roomConfig.photoGuidance.map((guidance, index) => (
            <PhotoCard
              key={guidance.label}
              photo={photos[guidance.label]}
              guidance={guidance}
              onTakePhoto={() => takePhoto(guidance)}
              onChooseFromGallery={() => chooseFromGallery(guidance)}
              index={index}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isProcessing ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.processingText}>
              Analyzing photos with AI...
            </Text>
            <Text style={styles.processingSubtext}>
              This may take 20-30 seconds
            </Text>
          </View>
        ) : (
          <Button 
            title="Continue"
            onPress={handleContinue}
            disabled={!hasMinimumPhoto}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  roomIcon: {
    fontSize: 60,
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  photoGrid: {
    gap: 0,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  processingText: {
    marginTop: 12,
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  processingSubtext: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
});