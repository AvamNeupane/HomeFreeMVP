/**
 * Project Name Screen — asks for a name right at the start of a fresh
 * organizing flow, before Room Selection. Without this, a project only
 * ever got a name if the user reached the Final Report and used its Save
 * button — meaning every "Continue Your Project?" prompt and Projects tab
 * entry along the way just showed a room list instead of something the
 * user actually chose, which stops being useful the moment there's more
 * than one in-progress project to tell apart. Optional — skipping falls
 * back to the same room-list label the app already used everywhere before
 * this screen existed.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import Icon from '../components/Icon';
import { apiFetch } from '../api';

export default function ProjectNameScreen({ goToScreen, updateData, appData, apiBaseUrl, sessionId }) {
  const [name, setName] = useState(appData.projectName || '');
  const [isSaving, setIsSaving] = useState(false);

  const proceed = async (finalName) => {
    setIsSaving(true);
    updateData({ projectName: finalName || null });
    if (sessionId && finalName) {
      try {
        await apiFetch(`${apiBaseUrl}/projects/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_name: finalName }),
        });
      } catch (error) {
        // Non-fatal — the name still lives in appData and the room list
        // fallback still works either way; worst case it just isn't saved
        // server-side until something else PATCHes the project.
        console.log('⚠️  Could not save project name yet (non-fatal):', error.message);
      }
    }
    goToScreen('roomSelection');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Icon name="clipboard" size={48} color={Colors.icon} style={styles.emoji} />
            <Text style={styles.title}>Name Your Project</Text>
            <Text style={styles.subtitle}>
              Give this organizing project a name — it'll help you tell it apart later if you have more than one in progress. Totally optional.
            </Text>
          </View>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Spring Cleaning, Guest Room Refresh..."
            placeholderTextColor={Colors.textLight}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => proceed(name.trim())}
          />
        </View>

        <View style={styles.footer}>
          <Button
            title={isSaving ? 'Saving...' : 'Continue'}
            onPress={() => proceed(name.trim())}
            loading={isSaving}
            disabled={isSaving}
          />
          <Button title="Skip" onPress={() => proceed('')} variant="outline" style={styles.skipButton} disabled={isSaving} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  flex: { flex: 1 },
  content: { flex: 1, padding: 30, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  emoji: { marginBottom: 16 },
  title: { fontSize: 28, fontFamily: Fonts.headingBold, color: Colors.accent, textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 320, alignSelf: 'center' },
  input: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footer: {
    padding: 20,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
  },
  skipButton: { marginTop: 0 },
});
