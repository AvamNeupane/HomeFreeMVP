/**
 * Area Photo Screen - Take detailed photos of specific area
 *
 * CHANGED (minimum photos): raised from 1 to 2 — a single photo doesn't
 * give the AI enough context for a good plan. Shows the exact requested
 * copy: "1 image won't provide enough context for the AI to create a good
 * plan, please upload more."
 *
 * CHANGED (dynamic photo guidance): after the first /area/analyze call, if
 * Gemini flags specific additional angles it needs (returned as
 * `additional_angles`), those are shown as extra guided photo slots below
 * the hardcoded ones. Continuing again re-analyzes with everything
 * captured so far; once nothing more is requested, the flow proceeds.
 *
 * CHANGED (optional extra photos): an "Add more photos (optional)" section
 * at the bottom lets the user attach any number of extra photos, one at a
 * time, each with a short text description — fully optional, add/remove
 * freely.
 *
 * CHANGED (flow reorder): this screen now runs BEFORE Measure Space, not
 * after — the AI needs to actually see the area's close-ups to judge
 * whether it has an interior worth measuring and to count shelves/
 * compartments (see MeasureSpaceScreen). Completion now goes to
 * 'measureSpace' instead of 'intentionQuestion'. Initial photo state seeds
 * from appData.areaPhotos when present, so returning here from Measure
 * Space's "Add More Photos" (uncertain compartment count) doesn't lose
 * what was already captured — appData.areaPhotos is only ever non-empty
 * on a return trip, since ItemSelectionScreen clears it to [] for a fresh
 * area.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, Alert, ActivityIndicator, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../constants/Colors';
import { apiFetch, appendImageFile } from '../api';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import PhotoCard from '../components/PhotoCard';
import ProgressBar from '../components/ProgressBar';
import Icon from '../components/Icon';
import { getAreaGuidance } from '../constants/RoomConfig';

const MINIMUM_PHOTOS_REQUIRED = 2;

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
  // CHANGED (crash fix): appData.currentItem can legitimately go null mid-
  // render — e.g. "Restart Session" clears appData before navigation away
  // actually completes, and this screen re-renders once in between with
  // currentItem already null. getAreaGuidance(currentItem.name) used to
  // throw synchronously right here, crashing the whole app. Guarded below;
  // areaGuidance falls back to [] so nothing after this line has to
  // re-guard against the null case.
  const areaGuidance = currentItem ? getAreaGuidance(currentItem.name) : [];
  const [photos, setPhotos] = useState(() => ({ ...(appData.areaPhotos || {}) }));
  const [dynamicGuidance, setDynamicGuidance] = useState([]); // AI-requested extra angles
  const [hasAnalyzedOnce, setHasAnalyzedOnce] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Optional extra photos + descriptions
  const [extraPhotos, setExtraPhotos] = useState([]); // {uri, description}
  const [pendingExtraUri, setPendingExtraUri] = useState(null);
  const [pendingExtraDescription, setPendingExtraDescription] = useState('');

  const requestPermissions = async () => {
    try {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (cameraPermission.status !== 'granted' || libraryPermission.status !== 'granted') {
        Alert.alert('Permission Required', 'Camera and photo library permissions are required to capture or select photos.', [{ text: 'OK' }]);
        return false;
      }
      return true;
    } catch (error) {
      Alert.alert('Permission Error', `Failed to request permissions: ${error.message}`, [{ text: 'OK' }]);
      return false;
    }
  };

  const takePhoto = async (guidance) => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setPhotos((prev) => ({ ...prev, [guidance.label]: [...(prev[guidance.label] || []), result.assets[0].uri] }));
      }
    } catch (error) {
      Alert.alert('Camera Error', `Failed to open camera: ${error.message}`, [{ text: 'OK' }]);
    }
  };

  const chooseFromGallery = async (guidance) => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setPhotos((prev) => ({ ...prev, [guidance.label]: [...(prev[guidance.label] || []), result.assets[0].uri] }));
      }
    } catch (error) {
      Alert.alert('Gallery Error', `Failed to open gallery: ${error.message}`, [{ text: 'OK' }]);
    }
  };

  const deletePhoto = (guidance, uri) => {
    setPhotos((prev) => {
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

  const allGuidance = [...areaGuidance, ...dynamicGuidance];
  // Counts categories with at least one photo, not total photos — a
  // category can hold several shots now, but "N of M" still tracks how
  // many of the guided categories have been started.
  const photoCount = Object.values(photos).filter((arr) => arr && arr.length > 0).length;
  const totalPhotoCount = Object.values(photos).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
  const hasMinimumPhoto = totalPhotoCount >= MINIMUM_PHOTOS_REQUIRED;

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
      Alert.alert('Session Error', 'Session not initialized. Please restart the app.', [{ text: 'OK' }]);
      return;
    }

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('area_name', currentItem.name);
      formData.append('room_type', appData.currentRoomLabel || currentRoomType);

      let imageIndex = 0;
      const labels = [];
      for (const guidance of allGuidance) {
        const uris = photos[guidance.label] || [];
        for (const uri of uris) {
          appendImageFile(formData, `image${imageIndex}`, uri, `${guidance.label}_${imageIndex}.jpg`);
          labels.push(guidance.label);
          imageIndex++;
        }
      }
      formData.append('photo_labels', JSON.stringify(labels));
      // Optional extra photos + descriptions ride along as additional
      // labeled images. CHANGED (bug fix): descriptions used to only
      // survive as a truncated filename slug the backend never read —
      // sent as a real form field now so Gemini actually sees them.
      extraPhotos.forEach((extra, i) => {
        appendImageFile(formData, `image${imageIndex}`, extra.uri, `extra_${i}.jpg`);
        if (extra.description) {
          formData.append(`extra_description${imageIndex}`, extra.description);
        }
        imageIndex++;
      });

      const response = await apiFetch(`${apiBaseUrl}/area/analyze`, { method: 'POST', body: formData, headers: { 'Content-Type': 'multipart/form-data' } });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to analyze area photos');
      }

      // CHANGED (bug fix: repeated "we need more photos" nagging): this
      // request-more-angles gate is now allowed to fire ONCE per area, not
      // every time Continue is pressed. Without hasAnalyzedOnce guarding
      // it, a user who ignored the first request (or added photos that
      // still didn't fully satisfy the AI) could hit Continue again and
      // get asked for yet another round indefinitely. One nudge is
      // reasonable; repeated pushback for more uploads is not.
      const requestedAngles = hasAnalyzedOnce ? [] : (data.additional_angles || []);
      setHasAnalyzedOnce(true);

      if (requestedAngles.length > 0) {
        // Merge in only genuinely new labels so re-analysis doesn't
        // duplicate cards already shown.
        setDynamicGuidance((prev) => {
          const existingLabels = new Set([...areaGuidance, ...prev].map((g) => g.label));
          const fresh = requestedAngles.filter((g) => !existingLabels.has(g.label));
          return [...prev, ...fresh];
        });
        setIsProcessing(false);
        Alert.alert(
          'A Couple More Angles Would Help',
          "We'd like a closer look at a couple of specific spots — they've been added below as optional. Feel free to add them or just continue as-is.",
          [{ text: 'OK' }]
        );
        return;
      }

      updateData({ areaPhotos: photos, currentQuestion: data.question, currentContext: data.context });
      goToScreen('measureSpace');
    } catch (error) {
      Alert.alert('Analysis Error', `Failed to analyze photos: ${error.message}\n\nPlease try again.`, [{ text: 'OK' }]);
      setIsProcessing(false);
    }
  };

  // Same null-guard reasoning as areaGuidance above — nothing past this
  // point can safely read currentItem.* without it.
  if (!currentItem) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerFallback}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <BackButton onPress={goBack} visible={canGoBack} />

        <View style={styles.header}>
          <Text style={styles.title}>{currentItem.name}</Text>
          <Text style={styles.subtitle}>
            Take or select at least {MINIMUM_PHOTOS_REQUIRED} focused photos ({allGuidance.length} suggested) — include a wide general shot plus specific close-ups where useful. Avoid blurry or far-away shots.
          </Text>
          <View style={styles.contextBox}>
            <Text style={styles.contextText}>{currentItem.reason}</Text>
          </View>
        </View>

        <ProgressBar current={photoCount} total={allGuidance.length} label={`Categories started (${MINIMUM_PHOTOS_REQUIRED} photos needed)`} />

        <View style={styles.photoGrid}>
          {allGuidance.map((guidance, index) => (
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
            <Text style={styles.processingText}>Analyzing your photos to build your plan...</Text>
            <Text style={styles.processingSubtext}>{hasAnalyzedOnce ? 'Checking your new angles...' : 'Generating personalized question...'}</Text>
          </View>
        ) : (
          <Button title="Continue" onPress={handleContinue} disabled={!hasMinimumPhoto} />
        )}
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  centerFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  keyboardView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 120 },
  header: { marginBottom: 30 },
  title: { fontSize: 32, fontFamily: Fonts.headingBold, color: Colors.accent, marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, marginBottom: 16 },
  contextBox: { backgroundColor: Colors.cardBackground, borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary },
  contextText: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textPrimary, lineHeight: 20 },
  photoGrid: { gap: 0 },
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
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  processingContainer: { alignItems: 'center', paddingVertical: 20 },
  processingText: { marginTop: 12, fontSize: 15, fontFamily: Fonts.bodySemiBold, color: Colors.textPrimary },
  processingSubtext: { marginTop: 4, fontSize: 13, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
});
