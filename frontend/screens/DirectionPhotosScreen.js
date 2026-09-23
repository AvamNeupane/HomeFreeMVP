/**
 * Direction Photos Screen — shown right after the user picks a direction
 * at the end of Natasha's chat (see IntentionQuestionScreen). Guides them
 * to take a couple of MORE SPECIFIC photos suited to that direction (e.g.
 * "Mess Cleanup" -> the messiest spot; "Style Refresh" -> a wide shot
 * showing the color/material palette), per the requirement that the user
 * be guided to more targeted photos after the chat rather than jumping
 * straight to a recommendation off the original wide shots alone.
 *
 * Fully optional — if Natasha didn't request any specific angles (or the
 * user chooses to skip), this screen just proceeds straight to generating
 * the recommendation. This is the single place that calls
 * /area/recommendations, so both the "had extra angles" and "no extra
 * angles" paths converge here.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../constants/Colors';
import { apiFetch, appendImageFile } from '../api';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import PhotoCard from '../components/PhotoCard';
import Icon from '../components/Icon';

export default function DirectionPhotosScreen({
  goToScreen,
  goBack,
  canGoBack,
  updateData,
  appData,
  apiBaseUrl,
  sessionId,
  reportUnsavedWork,
}) {
  const currentItem = appData.currentItem;
  const guidance = appData.followUpPhotoGuidance || [];
  const [photos, setPhotos] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  // These optional follow-up photos aren't submitted until Continue/Skip
  // (which calls /area/analyze + /area/recommendations) — the item's
  // direction is already confirmed and saved server-side, so leaving here
  // just re-lands on this same step, ready to retake them.
  const hasUnsavedWork = Object.keys(photos).length > 0;
  const unsavedWorkMessage = 'Your current page will not be saved, and when you resume the project you will resume off the last saved step.';

  useEffect(() => {
    reportUnsavedWork?.(hasUnsavedWork, unsavedWorkMessage);
  }, [hasUnsavedWork]);

  const handleBackPress = () => {
    if (hasUnsavedWork) {
      Alert.alert('Are You Sure You Want to Leave This Page?', unsavedWorkMessage, [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: goBack },
      ]);
      return;
    }
    goBack();
  };

  const requestPermissions = async () => {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (cameraPermission.status !== 'granted' || libraryPermission.status !== 'granted') {
      Alert.alert('Permission Required', 'Camera and photo library permissions are required.', [{ text: 'OK' }]);
      return false;
    }
    return true;
  };

  const takePhoto = async (item) => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setPhotos((prev) => ({ ...prev, [item.label]: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert('Camera Error', error.message, [{ text: 'OK' }]);
    }
  };

  const chooseFromGallery = async (item) => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setPhotos((prev) => ({ ...prev, [item.label]: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert('Gallery Error', error.message, [{ text: 'OK' }]);
    }
  };

  const deletePhoto = (item) => {
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[item.label];
      return next;
    });
  };

  const generateRecommendation = async () => {
    setIsProcessing(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/area/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          user_intention: appData.chatIntention || appData.chatPathLabel || 'Organize this area',
          organization_priorities: appData.organizationPriorities || [],
          visual_style: appData.visualStyle || null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate recommendations');
      }

      const newRecommendation = {
        area: currentItem.name,
        intention: appData.chatIntention,
        recommendations: data.recommendations,
        products: data.products || [],
      };
      updateData({
        currentRecommendation: newRecommendation,
        allRecommendations: [...(appData.allRecommendations || []), newRecommendation],
      });
      goToScreen('recommendations');
    } catch (error) {
      Alert.alert('Processing Error', `Failed to generate recommendations: ${error.message}`, [{ text: 'OK' }]);
      setIsProcessing(false);
    }
  };

  const handleContinue = async () => {
    const takenPhotos = guidance.filter((g) => photos[g.label]);

    if (takenPhotos.length === 0) {
      // Nothing new to send — just generate the recommendation.
      await generateRecommendation();
      return;
    }

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('area_name', currentItem.name);
      formData.append('room_type', appData.currentRoomLabel || appData.currentRoom);
      formData.append('photo_labels', JSON.stringify(takenPhotos.map((g) => g.label)));

      takenPhotos.forEach((g, i) => {
        appendImageFile(formData, `image${i}`, photos[g.label], `${g.label}.jpg`);
      });

      const response = await apiFetch(`${apiBaseUrl}/area/analyze`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to process the new photos');
      }
      updateData({ currentContext: data.context });
    } catch (error) {
      console.error('❌ Direction photo analysis error:', error);
      // Non-fatal — proceed to the recommendation even if this update failed.
    }

    await generateRecommendation();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <BackButton onPress={handleBackPress} visible={canGoBack} />

        <View style={styles.header}>
          <Icon name="target" size={44} color={Colors.icon} style={styles.emoji} />
          <Text style={styles.title}>A Couple More Photos</Text>
          <Text style={styles.subtitle}>
            {guidance.length > 0
              ? `Since you're going with "${appData.chatPathLabel}", these specific shots will help give you a more precise plan. Optional — skip if you'd rather not.`
              : 'No extra photos needed here — you can continue straight to your plan.'}
          </Text>
        </View>

        {guidance.length > 0 && (
          <View style={styles.photoGrid}>
            {guidance.map((item, index) => (
              <PhotoCard
                key={item.label}
                photos={photos[item.label] ? [photos[item.label]] : []}
                guidance={item}
                onTakePhoto={() => takePhoto(item)}
                onChooseFromGallery={() => chooseFromGallery(item)}
                onDeletePhoto={() => deletePhoto(item)}
                index={index}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {isProcessing ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.processingText}>Generating your plan...</Text>
          </View>
        ) : (
          <>
            <Button title="Continue" onPress={handleContinue} />
            {guidance.length > 0 && (
              <Button title="Skip These Photos" variant="outline" onPress={generateRecommendation} />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scrollContent: { padding: 20, paddingBottom: 140 },
  header: { alignItems: 'center', marginBottom: 20 },
  emoji: { fontSize: 52, marginBottom: 10 },
  title: { fontSize: 26, fontFamily: Fonts.headingBold, color: Colors.accent, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
  photoGrid: { gap: 0 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border, gap: 10 },
  processingContainer: { alignItems: 'center', paddingVertical: 20 },
  processingText: { marginTop: 12, fontSize: 15, fontFamily: Fonts.bodySemiBold, color: Colors.textPrimary },
});
