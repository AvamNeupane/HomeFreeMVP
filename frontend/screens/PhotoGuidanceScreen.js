/**
 * Photo Guidance Screen - Take guided room photos
 * Supports both camera capture and gallery selection
 *
 * CHANGED (minimum photos): raised from 1 to 2 — a single photo doesn't
 * give the AI enough context for a good plan. The remaining guidance cards
 * stay optional add-ons that improve detection quality.
 * CHANGED (optional extra photos): an "Add more photos (optional)" section
 * below the guided cards lets the user attach any number of extra photos
 * one at a time, each with a short description, fully optional.
 * CHANGED (delete photos): each captured photo can now be deleted outright.
 * CHANGED (back navigation): added a Back button at the top of the screen.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, Alert, ActivityIndicator, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../constants/Colors';
import { apiFetch, appendImageFile } from '../api';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import PhotoCard from '../components/PhotoCard';
import ProgressBar from '../components/ProgressBar';
import { ROOM_TYPES, buildCustomRoomConfig } from '../constants/RoomConfig';
import Icon from '../components/Icon';

const MINIMUM_PHOTOS_REQUIRED = 2;

export default function PhotoGuidanceScreen({
  goToScreen,
  goBack,
  canGoBack,
  updateData,
  appData,
  apiBaseUrl,
  sessionId,
  reportUnsavedWork,
}) {
  const currentRoomType = appData.currentRoom;
  // Falls back to a saved custom-room config (see RoomSelectionScreen's
  // "Create Your Own Room") for room keys that aren't one of the built-in
  // ROOM_TYPES entries.
  // The last fallback (a config synthesized on the spot) covers a custom
  // room resumed into this screen without its saved config in memory —
  // e.g. a fresh app launch, where appData.customRoomConfigs was never
  // repopulated because the name was never persisted server-side. Without
  // it, every roomConfig.* read below throws on an undefined roomConfig
  // instead of showing a slightly generic (but correct) custom-room icon.
  const roomConfig = ROOM_TYPES[currentRoomType]
    || (appData.customRoomConfigs || {})[currentRoomType]
    || buildCustomRoomConfig(appData.currentRoomLabel || currentRoomType);
  // CHANGED (AI-verified custom items round-trip): when the user couldn't
  // be identified in the room's existing photos on Item Selection and
  // chose "Add More Photos," we land back here with pendingVerifyItem set.
  // Seed from whatever photos already exist so they're not lost, and
  // re-verify that one item on Continue instead of re-running full room
  // detection (which would otherwise wipe every edit made on Item
  // Selection — renames, removes, other custom adds).
  const pendingVerifyItem = appData.pendingVerifyItem;
  const [photos, setPhotos] = useState(() => (pendingVerifyItem ? { ...(appData.roomPhotos || {}) } : {}));
  const [isProcessing, setIsProcessing] = useState(false);

  // Optional extra photos + descriptions (add one at a time, remove freely)
  const [extraPhotos, setExtraPhotos] = useState([]); // {uri, description}
  const [pendingExtraUri, setPendingExtraUri] = useState(null);
  const [pendingExtraDescription, setPendingExtraDescription] = useState('');

  // Nothing here is saved server-side until "Continue" (which calls
  // /room/detect-items) — for the normal new-room case there's no resume
  // point to fall back to at all yet, so the warning says so explicitly
  // rather than implying a "last saved step" that doesn't exist. The
  // pendingVerifyItem retry case is different: the room already exists,
  // only this one re-verification attempt would be lost.
  const hasUnsavedWork = Object.values(photos).some((arr) => arr && arr.length > 0) || extraPhotos.length > 0;
  const unsavedWorkMessage = pendingVerifyItem
    ? "These photos haven't been submitted yet — leaving now means losing them, and you'll need to retry verifying this item when you come back."
    : "None of these photos have been analyzed yet — if you leave now, this room won't be started, and you'll begin again from scratch.";

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

  const pickExtraPhoto = async (fromCamera) => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;
    try {
      const launch = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await launch({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setPendingExtraUri(result.assets[0].uri);
        setPendingExtraDescription('');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to open picker: ${error.message}`, [{ text: 'OK' }]);
    }
  };

  const confirmExtraPhoto = () => {
    if (!pendingExtraUri) return;
    setExtraPhotos((prev) => [...prev, { uri: pendingExtraUri, description: pendingExtraDescription.trim() }]);
    setPendingExtraUri(null);
    setPendingExtraDescription('');
  };

  const removeExtraPhoto = (index) => {
    setExtraPhotos((prev) => prev.filter((_, i) => i !== index));
  };

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
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const uri = result.assets[0].uri;
        console.log(`✅ Photo captured for ${guidance.label}: ${uri}`);
        setPhotos(prev => ({
          ...prev,
          [guidance.label]: [...(prev[guidance.label] || []), uri]
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
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const uri = result.assets[0].uri;
        console.log(`✅ Photo selected from gallery for ${guidance.label}: ${uri}`);
        setPhotos(prev => ({
          ...prev,
          [guidance.label]: [...(prev[guidance.label] || []), uri]
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
   * Remove one captured photo from a category (not a retake — just delete
   * it). A category can hold several photos now, so this removes only the
   * one matching `uri`, not the whole category.
   * @param {Object} guidance - Photo guidance object
   * @param {string} uri - the specific photo to remove
   */
  const deletePhoto = (guidance, uri) => {
    setPhotos(prev => {
      const next = { ...prev };
      const remaining = (next[guidance.label] || []).filter((u) => u !== uri);
      if (remaining.length > 0) {
        next[guidance.label] = remaining;
      } else {
        delete next[guidance.label];
      }
      return next;
    });
  };

  // Counts categories with at least one photo, not total photos — a
  // category can hold several shots now, but the "N of M" progress bar
  // still tracks how many of the guided categories have been started.
  const photoCount = Object.values(photos).filter((arr) => arr && arr.length > 0).length;
  const totalPhotoCount = Object.values(photos).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
  const hasMinimumPhoto = totalPhotoCount >= MINIMUM_PHOTOS_REQUIRED;

  /**
   * Process photos and detect items in room
   */
  const handleContinue = async () => {
    if (!hasMinimumPhoto) {
      Alert.alert(
        'More Photos Needed',
        "1 image won't provide enough context for the AI to create a good plan, please upload more.",
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
      if (pendingVerifyItem) {
        await retryPendingVerification();
        return;
      }

      console.log('📤 Uploading photos to backend...');

      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('room_type', appData.currentRoomLabel || roomConfig?.name || currentRoomType);
      // Stable key (e.g. "bedroom", or a custom room's slug) distinct from
      // room_type above, which is the human-readable label sent for the AI
      // prompt (e.g. "Bedroom") — status tracking and deep resume need to
      // match rooms by something that never changes case/spacing, which
      // the display label isn't guaranteed to.
      formData.append('room_key', currentRoomType);

      // Add whichever photos were taken (no longer required to be all of
      // them, and a category can now hold more than one photo). `labels`
      // carries the category for every image as an explicit field — not
      // just baked into the filename — so the backend can eventually use
      // it the same way analyze_specific_area's photo_labels already does.
      let imageIndex = 0;
      const labels = [];
      for (const guidance of roomConfig.photoGuidance) {
        const uris = photos[guidance.label] || [];
        for (const uri of uris) {
          appendImageFile(formData, `image${imageIndex}`, uri, `${guidance.label}_${imageIndex}.jpg`);
          labels.push(guidance.label);
          imageIndex++;
        }
      }
      formData.append('photo_labels', JSON.stringify(labels));
      // Optional extra photos + descriptions. CHANGED (bug fix): the
      // description text used to only survive as a truncated filename
      // slug that the backend never actually read — Gemini never saw it.
      // Sent as a real form field now (extra_description{i}), read
      // server-side and folded into the prompt as labeled context.
      extraPhotos.forEach((extra, i) => {
        appendImageFile(formData, `image${imageIndex}`, extra.uri, `extra_${i}.jpg`);
        if (extra.description) {
          formData.append(`extra_description${imageIndex}`, extra.description);
        }
        imageIndex++;
      });

      console.log(`📤 Uploading ${imageIndex} images for room analysis...`);

      const response = await apiFetch(`${apiBaseUrl}/room/detect-items`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      console.log('✅ Items detected:', data.items);

      updateData({
        roomPhotos: photos,
        detectedItems: data.items,
        currentItemIndex: 0,
        currentItem: data.items[0]
      });

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

  /**
   * Re-verifies the one item Item Selection couldn't confirm, using the
   * merged (old + newly-added) photo set, then returns there — does NOT
   * touch appData.detectedItems, so nothing else on that screen is lost.
   */
  const retryPendingVerification = async () => {
    try {
      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('item_name', pendingVerifyItem.name);
      formData.append('room_type', appData.currentRoomLabel || roomConfig?.name || currentRoomType);

      let imageIndex = 0;
      const labels = [];
      for (const guidance of roomConfig.photoGuidance) {
        const uris = photos[guidance.label] || [];
        for (const uri of uris) {
          appendImageFile(formData, `image${imageIndex}`, uri, `${guidance.label}_${imageIndex}.jpg`);
          labels.push(guidance.label);
          imageIndex++;
        }
      }
      formData.append('photo_labels', JSON.stringify(labels));
      extraPhotos.forEach((extra, i) => {
        appendImageFile(formData, `image${imageIndex}`, extra.uri, `extra_${i}.jpg`);
        imageIndex++;
      });

      const response = await apiFetch(`${apiBaseUrl}/room/verify-item`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Verification failed');
      }

      updateData({
        roomPhotos: photos,
        pendingVerifyItem: null,
        lastVerifyResult: {
          id: pendingVerifyItem.id,
          found: data.found,
          confidence: data.confidence,
          reason: data.reason,
        },
      });
      goToScreen('itemSelection');
    } catch (error) {
      console.error('❌ Verification retry error:', error);
      Alert.alert('Error', `Could not verify: ${error.message}`, [{ text: 'OK' }]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <BackButton onPress={handleBackPress} visible={canGoBack} />

        <View style={styles.header}>
          <View style={styles.roomIcon}>
            {pendingVerifyItem ? (
              <Icon name="search" size={48} color={Colors.icon} />
            ) : (
              <Icon name={roomConfig.icon} size={48} color={Colors.icon} />
            )}
          </View>
          <Text style={styles.title}>{pendingVerifyItem ? `Find "${pendingVerifyItem.name}"` : roomConfig.name}</Text>
          <Text style={styles.subtitle}>
            {pendingVerifyItem
              ? `We couldn't spot "${pendingVerifyItem.name}" in your photos yet. Add a photo that shows it clearly, then continue.`
              : `Take or select at least ${MINIMUM_PHOTOS_REQUIRED} focused photos to get started — the rest below are optional. Avoid blurry or far-away shots; the closer and clearer, the better the plan.`}
          </Text>
        </View>

        {!pendingVerifyItem && (
          <View style={styles.guidanceCallout}>
            <Text style={styles.guidanceCalloutText}>
              The quality of your organization plan starts here. Clear, well-lit, wide shot and specific photos gives the app what it needs to create a plan that is tailored and high quality.
            </Text>
          </View>
        )}

        <ProgressBar
          current={photoCount}
          total={roomConfig.photoGuidance.length}
          label={`Categories started (${MINIMUM_PHOTOS_REQUIRED} photos needed)`}
        />

        <View style={styles.photoGrid}>
          {roomConfig.photoGuidance.map((guidance, index) => (
            <PhotoCard
              key={guidance.label}
              photos={photos[guidance.label]}
              guidance={guidance}
              onTakePhoto={() => takePhoto(guidance)}
              onChooseFromGallery={() => chooseFromGallery(guidance)}
              onDeletePhoto={(uri) => deletePhoto(guidance, uri)}
              index={index}
            />
          ))}
        </View>

        <View style={styles.extraSection}>
          <Text style={styles.extraTitle}>Add more photos (optional)</Text>
          <Text style={styles.extraSubtitle}>
            Add extra context photos one at a time — pick a photo, add a short description, repeat. Add or remove as many as you like.
          </Text>

          {extraPhotos.map((extra, i) => (
            <View key={i} style={styles.extraItem}>
              <Image source={{ uri: extra.uri }} style={styles.extraThumb} />
              <Text style={styles.extraDescription} numberOfLines={2}>{extra.description || '(no description)'}</Text>
              <TouchableOpacity onPress={() => removeExtraPhoto(i)} style={styles.extraRemove}>
                <Icon name="close" size={14} color={Colors.textSecondary} strokeWidth={14} />
              </TouchableOpacity>
            </View>
          ))}

          {pendingExtraUri ? (
            <View style={styles.pendingBox}>
              <Image source={{ uri: pendingExtraUri }} style={styles.extraThumb} />
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.descriptionInput}
                  value={pendingExtraDescription}
                  onChangeText={setPendingExtraDescription}
                  placeholder="What is this a photo of?"
                  placeholderTextColor={Colors.textLight}
                />
                <View style={styles.pendingActions}>
                  <Button title="Add" onPress={confirmExtraPhoto} style={styles.pendingButton} />
                  <Button title="Cancel" variant="outline" onPress={() => setPendingExtraUri(null)} style={styles.pendingButton} />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.addExtraRow}>
              <Button title="Take Photo" icon="camera" variant="outline" onPress={() => pickExtraPhoto(true)} style={styles.addExtraButton} />
              <Button title="Choose Photo" icon="gallery" variant="outline" onPress={() => pickExtraPhoto(false)} style={styles.addExtraButton} />
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isProcessing ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.processingText}>
              Analyzing your photos to build your plan...
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  keyboardView: {
    flex: 1,
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
  guidanceCallout: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  guidanceCalloutText: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
  photoGrid: {
    gap: 0,
  },
  extraSection: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: Colors.border },
  extraTitle: { fontSize: 16, fontFamily: Fonts.bodySemiBold, color: Colors.accent, marginBottom: 6 },
  extraSubtitle: { fontSize: 13, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, lineHeight: 19, marginBottom: 14 },
  extraItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardBackground, borderRadius: 12, padding: 10, marginBottom: 10, gap: 10 },
  extraThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: Colors.border },
  extraDescription: { flex: 1, fontSize: 13, fontFamily: Fonts.bodyRegular, color: Colors.textPrimary },
  extraRemove: { padding: 6 },
  extraRemoveText: { fontSize: 16, color: Colors.textSecondary },
  pendingBox: { flexDirection: 'row', gap: 12, backgroundColor: Colors.cardBackground, borderRadius: 12, padding: 12, marginBottom: 10 },
  descriptionInput: { backgroundColor: Colors.white, borderRadius: 8, padding: 10, fontSize: 13, fontFamily: Fonts.bodyRegular, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border },
  pendingActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pendingButton: { flex: 1, paddingVertical: 8, minHeight: 36 },
  addExtraRow: { flexDirection: 'row', gap: 10 },
  addExtraButton: { flex: 1 },
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