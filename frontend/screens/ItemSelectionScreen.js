/**
 * Item Selection Screen — rebuilt for two responsibilities:
 *
 * 1. VERIFY what the AI detected: show each area's name, reason, and
 *    confidence %, and let the user rename, remove, or add areas before
 *    anything else happens. Low-confidence items are visually flagged.
 * 2. CHOOSE which of the verified areas to actually work on this session
 *    (checkbox cards) — this is what makes session length user-controlled
 *    instead of forcing a walk through every detected area.
 *
 * CHANGED (AI-verified custom items): "+ Add an area we missed" used to
 * just create a blindly-trusted placeholder with no AI confidence at all —
 * it would flow into measurement/chat/report as if it were real, with no
 * check that it's actually visible in the room's photos. It now:
 *   - Checks the typed name against the room's photos (/room/verify-item)
 *     before accepting it.
 *   - If found, adds it exactly like an AI-detected item (real confidence,
 *     eligible for measurement/chat/report).
 *   - If not found, shows "Can't identify '<name>' in your photos" with
 *     two explicit choices: Skip (drop it) or Add More Photos (routes back
 *     to Photo Guidance for this room to capture better evidence, then
 *     returns here to retry).
 *
 * CHANGED (state survives the photo round-trip): this screen's item list
 * now persists into appData.workingItems on every change, since navigating
 * to Photo Guidance and back would otherwise fully remount this screen and
 * silently drop any renames/removes/adds made before that trip.
 *
 * Output: appData.selectedItems (the filtered, user-approved list) and
 * appData.currentItem / currentItemIndex pointing at the first one, so the
 * rest of the existing measure -> photo -> intention -> recommendations
 * loop can iterate over selectedItems instead of the full raw detectedItems.
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Colors from '../constants/Colors';
import { apiFetch, appendImageFile, saveSelectedItems } from '../api';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import Icon from '../components/Icon';

const LOW_CONFIDENCE_THRESHOLD = 70;

function confidenceColor(confidence) {
  if (confidence == null) return Colors.textSecondary;
  if (confidence < LOW_CONFIDENCE_THRESHOLD) return '#C0392B';
  if (confidence < 90) return Colors.primary;
  return Colors.accent;
}

const deriveInitialItems = (appData) => {
  if (appData.workingItems) return appData.workingItems;
  return (appData.detectedItems || []).map((item, index) => ({
    id: `detected-${index}`,
    name: item.name,
    reason: item.reason,
    confidence: typeof item.confidence === 'number' ? item.confidence : null,
    included: true,
    custom: false,
    verifyStatus: 'verified', // AI-detected items are already grounded in the photos
  }));
};

export default function ItemSelectionScreen({ goToScreen, updateData, appData, apiBaseUrl, sessionId, reportUnsavedWork }) {
  const [items, setItems] = useState(() => deriveInitialItems(appData));
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  // Flips true the moment the user renames/removes/checks/adds anything —
  // none of it is saved server-side until "Continue" (saveSelectedItems),
  // so leaving before that reverts to the original AI-detected list.
  const [hasEdited, setHasEdited] = useState(false);

  // Persist every change so a Photo Guidance round-trip (for a failed
  // verification) doesn't lose renames/removes/other custom adds made here.
  useEffect(() => {
    updateData({ workingItems: items });
  }, [items]);

  useEffect(() => {
    reportUnsavedWork?.(
      hasEdited,
      'Your changes to this list will be lost, and you’ll see the original detected areas when you come back.'
    );
  }, [hasEdited]);

  // Returning from Photo Guidance after an "Add More Photos" retry.
  useEffect(() => {
    if (appData.lastVerifyResult) {
      applyVerifyResult(appData.lastVerifyResult);
      updateData({ lastVerifyResult: null });
    }
  }, [appData.lastVerifyResult]);

  const applyVerifyResult = (result) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== result.id) return item;
        if (result.found) {
          return {
            ...item,
            confidence: result.confidence,
            reason: result.reason || item.reason,
            verifyStatus: 'verified',
          };
        }
        return { ...item, verifyStatus: 'not_found', verifyReason: result.reason };
      })
    );
  };

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon name="sad" size={48} color={Colors.icon} style={styles.errorEmoji} />
          <Text style={styles.errorTitle}>No Items Detected</Text>
          <Text style={styles.errorText}>
            We couldn't identify any specific areas to organize. Please try taking the photo again.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const toggleIncluded = (id) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, included: !item.included } : item)));
    setHasEdited(true);
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setHasEdited(true);
  };

  const startEditing = (item) => {
    setEditingId(item.id);
    setEditValue(item.name);
  };

  const commitEdit = () => {
    if (!editValue.trim()) {
      setEditingId(null);
      return;
    }
    setItems((prev) => prev.map((item) => (item.id === editingId ? { ...item, name: editValue.trim() } : item)));
    setEditingId(null);
    setEditValue('');
    setHasEdited(true);
  };

  const verifyAgainstPhotos = async (id, name) => {
    setHasEdited(true);
    const roomPhotos = appData.roomPhotos || {};
    // roomPhotos is keyed by category -> array of uris (a category can hold
    // more than one photo now), so this needs flattening before it's a
    // plain list of uri strings — passing an array as a FormData `uri`
    // field crashes the upload.
    const photoUris = Object.values(roomPhotos).flat().filter(Boolean);

    if (photoUris.length === 0) {
      // No room photos to check against — accept it as unverified rather
      // than blocking (shouldn't normally happen; photos are required
      // earlier in the flow).
      setItems((prev) => [...prev, { id, name, reason: 'Added manually', confidence: null, included: true, custom: true, verifyStatus: 'verified' }]);
      return;
    }

    setIsVerifying(true);
    try {
      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('item_name', name);
      formData.append('room_type', appData.currentRoomLabel || appData.currentRoom);
      photoUris.forEach((uri, i) => {
        appendImageFile(formData, `image${i}`, uri, `verify_${i}.jpg`);
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

      const newItem = {
        id,
        name,
        reason: data.found ? (data.reason || 'Confirmed in your photos') : 'Added manually',
        confidence: data.found ? data.confidence : null,
        included: true,
        custom: true,
        verifyStatus: data.found ? 'verified' : 'not_found',
        verifyReason: data.reason,
      };
      setItems((prev) => [...prev, newItem]);
    } catch (error) {
      console.error('❌ Verify item error:', error);
      Alert.alert('Couldn’t Verify', `Something went wrong checking your photos: ${error.message}\n\nAdded as unverified — you can remove it if it's not right.`);
      setItems((prev) => [...prev, { id, name, reason: 'Added manually (unverified)', confidence: null, included: true, custom: true, verifyStatus: 'verified' }]);
    } finally {
      setIsVerifying(false);
    }
  };

  const addCustomArea = async () => {
    const name = newAreaName.trim();
    if (!name) return;
    setNewAreaName('');
    const newId = `custom-${Date.now()}`;
    await verifyAgainstPhotos(newId, name);
  };

  const skipUnverifiedItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addMorePhotosFor = (item) => {
    updateData({ pendingVerifyItem: { id: item.id, name: item.name } });
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    goToScreen('photoGuidance');
  };

  const handleContinue = () => {
    const selected = items.filter((item) => item.included && item.verifyStatus !== 'not_found');

    if (selected.length === 0) {
      Alert.alert(
        'No Areas Selected',
        'Please include at least one area to continue, or remove areas you don’t want to organize instead of unchecking all of them.',
        [{ text: 'OK' }]
      );
      return;
    }

    updateData({
      selectedItems: selected,
      currentItem: selected[0],
      currentItemIndex: 0,
      areaPhotos: [],
    });
    // Non-fatal: if this fails to save, the room just falls back to
    // re-showing Item Selection on a later deep resume instead of jumping
    // straight past it — not a lost-progress situation either way.
    saveSelectedItems(apiBaseUrl, sessionId, appData.currentRoom, selected);
    // CHANGED (flow reorder): close-up photos now come BEFORE measuring —
    // the AI needs to actually see the area to judge whether it has an
    // interior worth measuring and to count shelves/compartments, so
    // Measure Space now runs after Area Photos, not before it.
    goToScreen('areaPhoto');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="search" size={44} color={Colors.icon} style={styles.emoji} />
          <Text style={styles.title}>Here's what we found</Text>
          <Text style={styles.subtitle}>
            Confirm, rename, or remove anything below, then choose what to organize this session.
          </Text>
        </View>

        <View style={styles.itemGrid}>
          {items.map((item) => {
            const notFound = item.verifyStatus === 'not_found';
            return (
              <View key={item.id} style={[styles.itemCard, notFound && styles.itemCardWarning]}>
                {notFound ? (
                  <View>
                    <Text style={styles.notFoundTitle}>Can't identify "{item.name}" in your photos</Text>
                    {!!item.verifyReason && <Text style={styles.notFoundReason}>{item.verifyReason}</Text>}
                    <View style={styles.notFoundActions}>
                      <TouchableOpacity onPress={() => addMorePhotosFor(item)} style={[styles.notFoundButton, styles.notFoundButtonRow]}>
                        <Icon name="camera" size={16} color={Colors.white} style={styles.notFoundButtonIcon} />
                        <Text style={styles.notFoundButtonText}>Add More Photos</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => skipUnverifiedItem(item.id)} style={styles.notFoundButtonOutline}>
                        <Text style={styles.notFoundButtonOutlineText}>Skip This Item</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity style={styles.checkboxRow} onPress={() => toggleIncluded(item.id)} activeOpacity={0.7}>
                      <Icon name={item.included ? 'checkboxChecked' : 'checkboxEmpty'} size={20} color={item.included ? Colors.icon : Colors.textLight} style={styles.checkbox} />

                      <View style={styles.itemBody}>
                        {editingId === item.id ? (
                          <TextInput
                            style={styles.editInput}
                            value={editValue}
                            onChangeText={setEditValue}
                            onBlur={commitEdit}
                            onSubmitEditing={commitEdit}
                            autoFocus
                          />
                        ) : (
                          <View style={styles.itemHeader}>
                            <Text style={styles.itemName}>{item.name}</Text>
                            {item.confidence != null && (
                              <View style={[styles.confidenceBadge, { borderColor: confidenceColor(item.confidence) }]}>
                                <Text style={[styles.confidenceText, { color: confidenceColor(item.confidence) }]}>
                                  {item.confidence}%
                                </Text>
                              </View>
                            )}
                          </View>
                        )}

                        {item.reason ? <Text style={styles.itemReason}>{item.reason}</Text> : null}

                        {item.confidence != null && item.confidence < LOW_CONFIDENCE_THRESHOLD && (
                          <Text style={styles.lowConfidenceNote}>Low confidence — please confirm this is correct</Text>
                        )}
                      </View>
                    </TouchableOpacity>

                    <View style={styles.cardActions}>
                      <TouchableOpacity onPress={() => startEditing(item)} style={styles.actionLink}>
                        <Text style={styles.actionLinkText}>Rename</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.actionLink}>
                        <Text style={[styles.actionLinkText, styles.removeText]}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.addBox}>
          {isVerifying ? (
            <View style={styles.verifyingRow}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.verifyingText}>Checking your photos...</Text>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.addInput}
                value={newAreaName}
                onChangeText={setNewAreaName}
                placeholder="e.g. Reading Nook, Junk Drawer..."
                placeholderTextColor={Colors.textLight}
                onSubmitEditing={addCustomArea}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addButton, !newAreaName.trim() && styles.addButtonDisabled]}
                onPress={addCustomArea}
                activeOpacity={0.7}
                disabled={!newAreaName.trim()}
              >
                <Text style={styles.addButtonText}>+ Add an area we missed</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={[styles.hint, styles.hintRow]}>
          <Icon name="sparkle" size={16} color={Colors.icon} style={styles.hintIcon} />
          <Text style={styles.hintText}>
            Only the areas you check will be part of this session — you can always come back for the rest later.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Continue" onPress={handleContinue} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scrollContent: { padding: 30, paddingBottom: 120 },
  header: { alignItems: 'center', marginBottom: 30 },
  emoji: { fontSize: 60, marginBottom: 16 },
  title: { fontSize: 28, fontFamily: Fonts.headingBold, color: Colors.accent, marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', maxWidth: 320 },
  itemGrid: { gap: 16, marginBottom: 20 },
  itemCard: { backgroundColor: Colors.cardBackground, borderRadius: 16, padding: 20, borderWidth: 2, borderColor: Colors.border },
  itemCardWarning: { borderColor: '#C0392B', backgroundColor: '#FBEAE6' },
  notFoundTitle: { fontSize: 15, fontFamily: Fonts.bodySemiBold, color: '#C0392B', marginBottom: 4 },
  notFoundReason: { fontSize: 13, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, marginBottom: 12, lineHeight: 18 },
  notFoundActions: { flexDirection: 'row', gap: 10 },
  notFoundButton: { flex: 1, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  notFoundButtonRow: { flexDirection: 'row', justifyContent: 'center' },
  notFoundButtonIcon: { marginRight: 6 },
  notFoundButtonText: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.white },
  notFoundButtonOutline: { flex: 1, borderWidth: 1.5, borderColor: '#C0392B', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  notFoundButtonOutlineText: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: '#C0392B' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkbox: { fontSize: 22, color: Colors.primary, marginRight: 12, marginTop: 2 },
  itemBody: { flex: 1 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  itemName: { fontSize: 18, fontFamily: Fonts.bodySemiBold, color: Colors.accent },
  confidenceBadge: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  confidenceText: { fontSize: 12, fontFamily: Fonts.bodySemiBold },
  itemReason: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, lineHeight: 20 },
  lowConfidenceNote: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: '#C0392B', marginTop: 6 },
  editInput: { fontSize: 18, fontFamily: Fonts.bodySemiBold, color: Colors.accent, borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 4, marginBottom: 6 },
  cardActions: { flexDirection: 'row', gap: 20, marginTop: 12, paddingLeft: 34 },
  actionLink: { paddingVertical: 4 },
  actionLinkText: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  removeText: { color: '#C0392B' },
  addBox: { borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: 16, padding: 16, marginBottom: 20 },
  addInput: { backgroundColor: Colors.white, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  addButton: { alignItems: 'center', paddingVertical: 6 },
  addButtonDisabled: { opacity: 0.4 },
  addButtonText: { fontSize: 15, fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  verifyingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8 },
  verifyingText: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
  hint: { backgroundColor: Colors.secondary, borderRadius: 12, padding: 16, alignItems: 'center' },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start' },
  hintIcon: { marginRight: 10, marginTop: 2 },
  hintText: { flex: 1, fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.accent },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorEmoji: { fontSize: 80, marginBottom: 20 },
  errorTitle: { fontSize: 24, fontFamily: Fonts.headingBold, color: Colors.accent, marginBottom: 12 },
  errorText: { fontSize: 16, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
});
