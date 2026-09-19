/**
 * Room Selection Screen - Choose rooms to organize
 *
 * CHANGED (always allow organizing more): this screen used to always
 * overwrite appData.selectedRooms, which was fine the first time but would
 * have erased already-finished rooms if the user came back mid-session via
 * RecommendationsScreen's "Organize Another Room". It now APPENDS newly
 * picked rooms onto whatever was already there, and points currentRoomIndex
 * at the first newly-added room so already-completed rooms aren't redone.
 * CHANGED (back navigation): added a Back button at the top of the screen.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ScrollView, Alert, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import { ROOM_TYPES, buildCustomRoomConfig } from '../constants/RoomConfig';
import { updateRoomStatus, fetchProjectDetail, computeRoomResumeTarget } from '../api';
import Icon from '../components/Icon';

// Turns a user-typed room name into a stable, unique room key — slugified
// so it's safe to use as an object key / form field / URL-ish identifier
// everywhere a built-in room's key (e.g. "living_room") already is, plus a
// short suffix so two custom rooms with the same name this session (or a
// name that happens to collide with a built-in key) don't overwrite each
// other.
const slugifyRoomName = (name) => {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'room';
  return `custom_${base}_${Date.now().toString(36).slice(-4)}`;
};

export default function RoomSelectionScreen({ goToScreen, goBack, canGoBack, updateData, appData, apiBaseUrl, sessionId }) {
  const alreadyChosenRooms = appData.selectedRooms || [];
  const roomStatuses = appData.roomStatuses || {};
  const savedCustomRooms = appData.customRoomConfigs || {};
  const [selectedRooms, setSelectedRooms] = useState([]);
  // Custom rooms created THIS round (not yet saved to appData — that only
  // happens on Continue, same as everything else on this screen).
  const [draftCustomRooms, setDraftCustomRooms] = useState({});
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customRoomName, setCustomRoomName] = useState('');

  const allRoomEntries = [
    ...Object.entries(ROOM_TYPES),
    ...Object.entries(savedCustomRooms),
    ...Object.entries(draftCustomRooms),
  ];

  // Resolves a room key (built-in or custom) to its human-readable name —
  // used for `currentRoomLabel`, which every downstream screen sends to
  // the backend instead of the raw key. Without this, a custom room's
  // slugified key (e.g. "custom_craft_room_a1b2") would leak straight into
  // AI prompts ("a custom_craft_room_a1b2 in a ...").
  const roomNameFor = (key) =>
    (ROOM_TYPES[key] || savedCustomRooms[key] || draftCustomRooms[key] || {}).name || key;

  const addCustomRoom = () => {
    const name = customRoomName.trim();
    if (!name) return;
    const key = slugifyRoomName(name);
    setDraftCustomRooms((prev) => ({ ...prev, [key]: buildCustomRoomConfig(name) }));
    setSelectedRooms((prev) => [...prev, key]);
    setCustomRoomName('');
    setShowCustomInput(false);
  };

  const toggleRoom = (roomKey) => {
    if (selectedRooms.includes(roomKey)) {
      setSelectedRooms(selectedRooms.filter(r => r !== roomKey));
    } else {
      setSelectedRooms([...selectedRooms, roomKey]);
    }
  };

  const [isResuming, setIsResuming] = useState(false);

  // Shared bookkeeping for both Resume and Start Over: makes sure the room
  // is (still) present in selectedRooms/currentRoomIndex so later
  // hasMoreRooms checks in RecommendationsScreen stay correct.
  const prepRoomSelection = (roomKey) => {
    const alreadyInSelectedRooms = alreadyChosenRooms.includes(roomKey);
    const combinedRooms = alreadyInSelectedRooms ? alreadyChosenRooms : [...alreadyChosenRooms, roomKey];
    return { combinedRooms, roomIndex: combinedRooms.indexOf(roomKey) };
  };

  // Reconstructs exactly which screen (and item/chat/measurement state)
  // this room was left on from what's persisted server-side — see
  // computeRoomResumeTarget for the full step-by-step derivation — instead
  // of only remembering "this room isn't finished" and re-starting it from
  // Photo Guidance every time.
  const resumeRoom = async (roomKey) => {
    const { combinedRooms, roomIndex } = prepRoomSelection(roomKey);
    setIsResuming(true);
    try {
      const project = await fetchProjectDetail(apiBaseUrl, sessionId);
      const target = project ? computeRoomResumeTarget(project, roomKey) : { screen: 'photoGuidance' };
      updateData({
        selectedRooms: combinedRooms,
        currentRoomIndex: roomIndex,
        currentRoom: roomKey,
        currentRoomLabel: roomNameFor(roomKey),
        detectedItems: target.detectedItems || [],
        selectedItems: target.selectedItems || [],
        workingItems: target.selectedItems || null,
        currentItemIndex: target.currentItemIndex || 0,
        currentItem: target.currentItem || null,
        currentContext: target.currentContext || null,
        chatPathLabel: target.chatPathLabel || null,
        followUpPhotoGuidance: target.followUpPhotoGuidance || [],
        currentRecommendation: target.currentRecommendation || null,
        resumeChat: target.resumeChat || null,
      });
      goToScreen(target.screen);
    } finally {
      setIsResuming(false);
    }
  };

  const startRoomOver = async (roomKey) => {
    const { combinedRooms, roomIndex } = prepRoomSelection(roomKey);
    updateData({
      roomStatuses: { ...roomStatuses, [roomKey]: 'discarded' },
      selectedRooms: combinedRooms,
      currentRoomIndex: roomIndex,
      currentRoom: roomKey,
      currentRoomLabel: roomNameFor(roomKey),
      roomPhotos: [],
      detectedItems: [],
      selectedItems: [],
      workingItems: null,
      currentItemIndex: 0,
      currentItem: null,
    });
    // Awaited (unlike the status update elsewhere) so a resume of this
    // same room later can't race the GET and still see 'in_progress'.
    await updateRoomStatus(apiBaseUrl, sessionId, roomKey, 'discarded');
    goToScreen('photoGuidance');
  };

  const handleInProgressRoomPress = (roomKey, roomName) => {
    Alert.alert(
      roomName,
      'You started this room but haven’t finished it. Resume where you left off, or start it over?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start This Room Over', style: 'destructive', onPress: () => startRoomOver(roomKey) },
        { text: 'Resume Where I Left Off', onPress: () => resumeRoom(roomKey) },
      ]
    );
  };

  const handleContinue = () => {
    if (selectedRooms.length === 0) {
      Alert.alert(
        'No Rooms Selected',
        'Please select at least one room to organize.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Append onto any rooms already organized this session instead of
    // replacing them, so returning here later doesn't lose earlier work.
    const combinedRooms = [...alreadyChosenRooms, ...selectedRooms];
    const nextRoomIndex = alreadyChosenRooms.length; // first newly-added room

    console.log('✅ Selected rooms this round:', selectedRooms);
    updateData({
      selectedRooms: combinedRooms,
      currentRoomIndex: nextRoomIndex,
      currentRoom: combinedRooms[nextRoomIndex],
      currentRoomLabel: roomNameFor(combinedRooms[nextRoomIndex]),
      customRoomConfigs: { ...savedCustomRooms, ...draftCustomRooms },
      roomPhotos: [],
      detectedItems: [],
      selectedItems: [],
      currentItemIndex: 0,
      currentItem: null
    });
    goToScreen('photoGuidance');
  };

  return (
    <SafeAreaView style={styles.container}>
      {isResuming && (
        <View style={styles.resumingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.resumingText}>Picking up where you left off...</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <BackButton onPress={goBack} visible={canGoBack} />

        <View style={styles.header}>
          <Text style={styles.title}>Select Rooms</Text>
          <Text style={styles.subtitle}>
            Choose which rooms you'd like to organize
          </Text>
        </View>

        <View style={styles.roomGrid}>
          {allRoomEntries.map(([key, room]) => {
            const isSelected = selectedRooms.includes(key);
            // 'discarded' rooms are treated as never-started — the user
            // chose to redo them, so they shouldn't stay locked or show a
            // stale "in progress" badge.
            const status = roomStatuses[key];
            const isCompleted = status === 'completed';
            const isInProgress = status === 'in_progress' && alreadyChosenRooms.includes(key);
            const isLocked = isCompleted;

            const handlePress = () => {
              if (isCompleted) return;
              if (isInProgress) {
                handleInProgressRoomPress(key, room.name);
                return;
              }
              toggleRoom(key);
            };

            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.roomCard,
                  isSelected && styles.roomCardSelected,
                  isInProgress && styles.roomCardInProgress,
                  isLocked && styles.roomCardDone
                ]}
                onPress={handlePress}
                activeOpacity={isLocked ? 1 : 0.7}
                disabled={isLocked}
              >
                <View style={styles.roomIcon}>
                  <Icon name={room.icon} size={36} color={isLocked ? Colors.textLight : Colors.icon} />
                </View>
                <View style={styles.roomInfo}>
                  <Text style={[
                    styles.roomName,
                    isSelected && styles.roomNameSelected
                  ]}>
                    {room.name}
                  </Text>
                  <Text style={[styles.photoCount, isInProgress && styles.photoCountInProgress]}>
                    {isCompleted
                      ? 'Already organized this session'
                      : isInProgress
                        ? 'In progress — tap to resume or restart'
                        : `${room.photoGuidance.length} photos`}
                  </Text>
                </View>
                {(isSelected || isCompleted) && (
                  <View style={styles.checkmark}>
                    <Icon name="check" size={16} color={Colors.white} strokeWidth={14} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {showCustomInput ? (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.customInputBox}>
                <TextInput
                  style={styles.customInput}
                  value={customRoomName}
                  onChangeText={setCustomRoomName}
                  placeholder="e.g. Craft Room, Mudroom..."
                  placeholderTextColor={Colors.textLight}
                  autoFocus
                  onSubmitEditing={addCustomRoom}
                  returnKeyType="done"
                />
                <View style={styles.customInputActions}>
                  <Button title="Add Room" onPress={addCustomRoom} disabled={!customRoomName.trim()} style={styles.customInputButton} />
                  <Button
                    title="Cancel"
                    variant="outline"
                    onPress={() => { setShowCustomInput(false); setCustomRoomName(''); }}
                    style={styles.customInputButton}
                  />
                </View>
              </View>
            </KeyboardAvoidingView>
          ) : (
            <TouchableOpacity style={styles.addCustomCard} onPress={() => setShowCustomInput(true)} activeOpacity={0.7}>
              <Icon name="plus" size={28} color={Colors.icon} style={styles.roomIcon} />
              <Text style={styles.addCustomText}>Create Your Own Room</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button 
          title={`Continue${selectedRooms.length > 0 ? ` (${selectedRooms.length} selected)` : ''}`}
          onPress={handleContinue}
          disabled={selectedRooms.length === 0}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  resumingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    gap: 14,
  },
  resumingText: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
  },
  scrollContent: {
    padding: 30,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 36,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  roomGrid: {
    gap: 16,
  },
  roomCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  roomCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  roomCardDone: {
    opacity: 0.5,
  },
  roomCardInProgress: {
    borderColor: Colors.warning,
    backgroundColor: Colors.white,
  },
  photoCountInProgress: {
    color: Colors.warning,
    fontFamily: Fonts.bodySemiBold,
  },
  roomIcon: {
    marginRight: 16,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 18,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  roomNameSelected: {
    color: Colors.accent,
  },
  photoCount: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
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
  addCustomCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  addCustomText: {
    fontSize: 16,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.icon,
  },
  customInputBox: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  customInput: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  customInputActions: {
    flexDirection: 'row',
    gap: 10,
  },
  customInputButton: {
    flex: 1,
    paddingVertical: 8,
    minHeight: 40,
  },
});