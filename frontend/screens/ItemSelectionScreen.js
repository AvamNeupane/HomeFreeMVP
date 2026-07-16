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
 * Output: appData.selectedItems (the filtered, user-approved list) and
 * appData.currentItem / currentItemIndex pointing at the first one, so the
 * rest of the existing measure -> photo -> priorities -> intention ->
 * recommendations loop (in RecommendationsScreen.js) can iterate over
 * selectedItems instead of the full raw detectedItems array.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';

const LOW_CONFIDENCE_THRESHOLD = 70;

function confidenceColor(confidence) {
  if (confidence == null) return Colors.textSecondary; // manually added, no AI confidence
  if (confidence < LOW_CONFIDENCE_THRESHOLD) return '#C0392B';
  if (confidence < 90) return Colors.primary;
  return Colors.accent;
}

export default function ItemSelectionScreen({ goToScreen, updateData, appData }) {
  const initialItems = (appData.detectedItems || []).map((item, index) => ({
    id: `detected-${index}`,
    name: item.name,
    reason: item.reason,
    confidence: typeof item.confidence === 'number' ? item.confidence : null,
    included: true,
    custom: false,
  }));

  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  if (initialItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorTitle}>No Items Detected</Text>
          <Text style={styles.errorText}>
            We couldn't identify any specific areas to organize. Please try taking the photo again.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const toggleIncluded = (id) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, included: !item.included } : item))
    );
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
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
    setItems((prev) =>
      prev.map((item) => (item.id === editingId ? { ...item, name: editValue.trim() } : item))
    );
    setEditingId(null);
    setEditValue('');
  };

  const addCustomArea = () => {
    const newId = `custom-${Date.now()}`;
    setItems((prev) => [
      ...prev,
      {
        id: newId,
        name: 'New Area',
        reason: 'Added manually',
        confidence: null,
        included: true,
        custom: true,
      },
    ]);
    // Immediately open it for renaming
    setEditingId(newId);
    setEditValue('New Area');
  };

  const handleContinue = () => {
    const selected = items.filter((item) => item.included);

    if (selected.length === 0) {
      Alert.alert(
        'No Areas Selected',
        'Please include at least one area to continue, or remove areas you don\u2019t want to organize instead of unchecking all of them.',
        [{ text: 'OK' }]
      );
      return;
    }

    console.log(
      '✅ Selected areas for this session:',
      selected.map((i) => i.name)
    );

    updateData({
      selectedItems: selected,
      currentItem: selected[0],
      currentItemIndex: 0,
      areaPhotos: [],
    });
    goToScreen('measureSpace');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.emoji}>🔍</Text>
          <Text style={styles.title}>Here's what we found</Text>
          <Text style={styles.subtitle}>
            Confirm, rename, or remove anything below, then choose what to organize this session.
          </Text>
        </View>

        <View style={styles.itemGrid}>
          {items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => toggleIncluded(item.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.checkbox}>{item.included ? '☑' : '☐'}</Text>

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
                        <View
                          style={[
                            styles.confidenceBadge,
                            { borderColor: confidenceColor(item.confidence) },
                          ]}
                        >
                          <Text
                            style={[
                              styles.confidenceText,
                              { color: confidenceColor(item.confidence) },
                            ]}
                          >
                            {item.confidence}%
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {item.reason ? <Text style={styles.itemReason}>{item.reason}</Text> : null}

                  {item.confidence != null && item.confidence < LOW_CONFIDENCE_THRESHOLD && (
                    <Text style={styles.lowConfidenceNote}>
                      Low confidence — please confirm this is correct
                    </Text>
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
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.addButton} onPress={addCustomArea} activeOpacity={0.7}>
          <Text style={styles.addButtonText}>+ Add an area we missed</Text>
        </TouchableOpacity>

        <View style={styles.hint}>
          <Text style={styles.hintText}>
            💡 Only the areas you check will be part of this session — you can always come back for the rest later.
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
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    padding: 30,
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  emoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  itemGrid: {
    gap: 16,
    marginBottom: 20,
  },
  itemCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    fontSize: 22,
    color: Colors.primary,
    marginRight: 12,
    marginTop: 2,
  },
  itemBody: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  itemName: {
    fontSize: 18,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
  },
  confidenceBadge: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  confidenceText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
  },
  itemReason: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  lowConfidenceNote: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: '#C0392B',
    marginTop: 6,
  },
  editInput: {
    fontSize: 18,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    paddingVertical: 4,
    marginBottom: 6,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
    paddingLeft: 34,
  },
  actionLink: {
    paddingVertical: 4,
  },
  actionLinkText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  removeText: {
    color: '#C0392B',
  },
  addButton: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  addButtonText: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  hint: {
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.accent,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  errorEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});