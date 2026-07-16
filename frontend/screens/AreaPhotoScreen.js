/**
 * Area Photo Screen - Take detailed photos of specific area
 * Supports both camera capture and gallery selection
 *
 * CHANGED (photo count fix): this screen used to require EVERY guidance
 * photo (areaGuidance.every(...)) before Continue was enabled — e.g. all 6
 * for a desk. It now only requires ONE, matching PhotoGuidanceScreen's
 * "one photo is always enough" rule. The rest stay as optional add-ons.
 * CHANGED (delete photos): each captured photo can now be deleted outright,
 * not just retaken.
 * CHANGED (back navigation): added a Back button at the top of the screen.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import PhotoCard from '../components/PhotoCard';
import ProgressBar from '../components/ProgressBar';
import { getAreaGuidance } from '../constants/RoomConfig';

const MINIMUM_PHOTOS_REQUIRED = 1;

export default function AreaPhotoScreen({ 
  goToScreen, 
  goBack,
  canGoBack,
  updateData, 
  appData,
  apiBaseUrl,
  sessionId
}) {
  const currentItem = appData.currentItem;
  const currentRoomType = appData.currentRoom;
  const areaGuidance = getAreaGuidance(currentItem.name);
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
   * Take photo using camera for specific area guidance
   * @param {Object} guidance - Photo guidance object
   */
  const takePhoto = async (guidance) => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      console.log(`📷 Opening camera for ${guidance.label} (${currentItem.name})...`);

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
   * Choose photo from gallery for specific area guidance
   * @param {Object} guidance - Photo guidance object
   */
  const chooseFromGallery = async (guidance) => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      console.log(`🖼️  Opening gallery for ${guidance.label} (${currentItem.name})...`);

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

  /**
   * Remove a captured photo entirely (not a retake — just delete it).
   * @param {Object} guidance - Photo guidance object
   */
  const deletePhoto = (guidance) => {
    setPhotos(prev => {
      const next = { ...prev };
      delete next[guidance.label];
      return next;
    });
  };

  const photoCount = Object.keys(photos).length;
  // CHANGED: used to be areaGuidance.every(...) — now the user decides how
  // many of the optional close-ups to take, same as room-level photos.
  const hasMinimumPhoto = photoCount >= MINIMUM_PHOTOS_REQUIRED;

  /**
   * Process area photos and generate contextual question
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
      console.log('📤 Analyzing area photos...');

      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('area_name', currentItem.name);
      formData.append('room_type', currentRoomType);

      // Only send whichever photos were actually taken (no longer required
      // to be all of them).
      const takenGuidance = areaGuidance.filter(g => photos[g.label]);
      const labels = takenGuidance.map(g => g.label);
      formData.append('photo_labels', JSON.stringify(labels));

      let imageIndex = 0;
      for (const guidance of takenGuidance) {
        const uri = photos[guidance.label];
        formData.append(`image${imageIndex}`, {
          uri: uri,
          type: 'image/jpeg',
          name: `${guidance.label}.jpg`
        });
        imageIndex++;
      }

      console.log(`📤 Uploading ${imageIndex} area images for ${currentItem.name}...`);

      const response = await fetch(`${apiBaseUrl}/area/analyze`, {
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
        throw new Error(data.error || 'Failed to analyze area photos');
      }

      console.log('✅ Area analyzed, question generated:', data.question);

      updateData({
        areaPhotos: photos,
        currentQuestion: data.question,
        currentContext: data.context
      });

      goToScreen('intentionQuestion');

    } catch (error) {
      console.error('❌ Analysis error:', error);
      Alert.alert(
        'Analysis Error',
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
        <BackButton onPress={goBack} visible={canGoBack} />

        <View style={styles.header}>
          <Text style={styles.title}>{currentItem.name}</Text>
          <Text style={styles.subtitle}>
            Take or select at least 1 photo ({areaGuidance.length} suggested, optional)
          </Text>
          <View style={styles.contextBox}>
            <Text style={styles.contextText}>{currentItem.reason}</Text>
          </View>
        </View>

        <ProgressBar 
          current={photoCount}
          total={areaGuidance.length}
          label="Photos captured (1 needed)"
        />

        <View style={styles.photoGrid}>
          {areaGuidance.map((guidance, index) => (
            <PhotoCard
              key={guidance.label}
              photo={photos[guidance.label]}
              guidance={guidance}
              onTakePhoto={() => takePhoto(guidance)}
              onChooseFromGallery={() => chooseFromGallery(guidance)}
              onDelete={() => deletePhoto(guidance)}
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
              Generating personalized question...
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
    marginBottom: 30,
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
    marginBottom: 16,
  },
  contextBox: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  contextText: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    lineHeight: 20,
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