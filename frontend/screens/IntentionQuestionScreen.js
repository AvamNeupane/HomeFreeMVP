/**
 * Natasha's guided intake chat for one area.
 *
 * CHANGED (direction selection): the chat used to silently infer a single
 * "path" and jump straight to recommendations once done. It now shows the
 * 1-3 directions Natasha proposes (e.g. "Mess Cleanup" / "Style Refresh" /
 * "Both") as tappable choices — the user picks, nothing is auto-decided
 * for them. Picking a direction hands off to DirectionPhotosScreen for a
 * couple of targeted follow-up photos before the recommendation is
 * generated.
 * CHANGED (no more echoing): the backend prompt now explicitly forbids
 * repeating the user's message back to them; this screen has no client
 * logic that did that, but is worth noting alongside the above.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TextInput,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
  TouchableOpacity,
} from 'react-native';
import Colors from '../constants/Colors';
import { apiFetch } from '../api';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import Icon from '../components/Icon';

export default function IntentionQuestionScreen({
  goToScreen,
  goBack,
  canGoBack,
  updateData,
  appData,
  apiBaseUrl,
  sessionId,
  reportUnsavedWork
}) {
  const currentContext = appData.currentContext;
  const currentItem = appData.currentItem;

  const [chatMessages, setChatMessages] = useState([]); // {role: 'natasha'|'user', text}
  const [userInput, setUserInput] = useState('');

  // Every SENT message is already saved server-side after each turn — only
  // an in-progress, unsent draft is actually at risk here, unlike every
  // other screen in this flow where the whole step is unsubmitted.
  const hasUnsavedWork = !!userInput.trim();
  const unsavedWorkMessage = "Your conversation so far is saved — only what you're currently typing will be lost.";

  useEffect(() => {
    reportUnsavedWork?.(hasUnsavedWork, unsavedWorkMessage);
  }, [hasUnsavedWork]);

  const handleBackPress = () => {
    if (hasUnsavedWork) {
      Alert.alert('Leave Without Sending This Message?', unsavedWorkMessage, [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: goBack },
      ]);
      return;
    }
    goBack();
  };
  const [isStarting, setIsStarting] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [pathOptions, setPathOptions] = useState([]);
  const [isConfirming, setIsConfirming] = useState(false);
  // CHANGED (perceived speed): a single Gemini exchange normally takes
  // ~2-4s (measured, not a bug — see OVERVIEW.md) — "Natasha is typing..."
  // alone can start to feel stuck around that mark. Swaps to a reassuring
  // second line rather than pretending it's instant.
  const [isTakingAWhile, setIsTakingAWhile] = useState(false);
  const scrollRef = useRef(null);
  // CHANGED (keyboard covering the input, take 2): KeyboardAvoidingView's
  // `keyboardVerticalOffset` relies on it correctly measuring its own
  // on-screen position, which — especially after the Expo SDK 57 / New
  // Architecture upgrade — was landing wrong on-device even after tuning
  // the offset (still reported as covering the text). Tracking the real
  // keyboard height directly from OS keyboard events and applying it as
  // padding is deterministic instead: it's driven by what the OS actually
  // reports, not by a layout measurement that can race or miscalculate.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e?.endCoordinates?.height || 0);
      scrollToEnd();
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    // A deep resume seeds the transcript already recorded server-side
    // (see computeRoomResumeTarget) — calling startChat()'s no-message
    // POST here would ask the model for a brand new turn on top of it,
    // silently advancing the conversation the user never asked to
    // continue. Render the restored history instead and only hit the
    // API once they actually send something.
    if (appData.resumeChat) {
      setChatMessages(appData.resumeChat.messages || []);
      setPathOptions(appData.resumeChat.pathOptions || []);
      setIsStarting(false);
      updateData({ resumeChat: null });
      scrollToEnd();
      return;
    }
    startChat();
  }, []);

  useEffect(() => {
    if (!isStarting && !isSending) {
      setIsTakingAWhile(false);
      return;
    }
    const timer = setTimeout(() => setIsTakingAWhile(true), 2500);
    return () => clearTimeout(timer);
  }, [isStarting, isSending]);

  const scrollToEnd = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const startChat = async () => {
    if (!sessionId) {
      Alert.alert('Error', 'Session not initialized. Please restart the app.');
      return;
    }
    setIsStarting(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/area/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          area_name: currentItem.name,
          room_type: appData.currentRoom,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start conversation');
      }
      setChatMessages([{ role: 'natasha', text: data.reply }]);
      if (data.done) setPathOptions(data.path_options || []);
    } catch (error) {
      console.error('❌ Chat start error:', error);
      Alert.alert('Error', `Could not start the conversation: ${error.message}`);
    } finally {
      setIsStarting(false);
      scrollToEnd();
    }
  };

  const handleSend = async () => {
    const text = userInput.trim();
    if (!text || isSending) return;

    Keyboard.dismiss();
    const optimistic = [...chatMessages, { role: 'user', text }];
    setChatMessages(optimistic);
    setUserInput('');
    setIsSending(true);
    scrollToEnd();

    try {
      const response = await apiFetch(`${apiBaseUrl}/area/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          area_name: currentItem.name,
          room_type: appData.currentRoom,
          user_message: text,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send message');
      }

      setChatMessages([...optimistic, { role: 'natasha', text: data.reply, guardrail: data.guardrail_triggered }]);
      scrollToEnd();

      if (data.done) setPathOptions(data.path_options || []);
    } catch (error) {
      console.error('❌ Chat send error:', error);
      Alert.alert('Error', `Could not send your message: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectDirection = async (option) => {
    setIsConfirming(true);
    try {
      const intention = chatMessages.filter((m) => m.role === 'user').map((m) => m.text).join(' ')
        || option.description || option.label;

      const response = await apiFetch(`${apiBaseUrl}/area/confirm-direction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          area_name: currentItem.name,
          room_type: appData.currentRoom,
          selected_path: option,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to confirm direction');
      }

      updateData({
        chatIntention: intention,
        chatPathLabel: data.chat_path_label,
        followUpPhotoGuidance: data.follow_up_photo_guidance || [],
      });

      goToScreen('directionPhotos');
    } catch (error) {
      console.error('❌ Confirm direction error:', error);
      Alert.alert('Error', `Could not confirm your choice: ${error.message}`);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.keyboardView, { paddingBottom: keyboardHeight }]}>
        <BackButton onPress={handleBackPress} visible={canGoBack} style={styles.backButton} />

        <View style={styles.header}>
          <Icon name="chat" size={40} color={Colors.icon} style={styles.emoji} />
          <Text style={styles.title}>Let's talk it through</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={scrollToEnd}
        >
          {currentContext && (
            <View style={styles.contextBox}>
              <Text style={styles.contextLabel}>What we see:</Text>
              <Text style={styles.contextText}>{currentContext}</Text>
            </View>
          )}

          {chatMessages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === 'natasha' ? styles.bubbleNatasha : styles.bubbleUser,
                m.guardrail && styles.bubbleGuardrail,
              ]}
            >
              <Text style={[styles.bubbleText, m.role === 'user' && styles.bubbleTextUser]}>{m.text}</Text>
            </View>
          ))}

          {(isStarting || isSending) && (
            <View style={styles.typingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.typingText}>
                {isTakingAWhile ? 'Still thinking it through...' : 'Typing...'}
              </Text>
            </View>
          )}

          {pathOptions.length > 0 && !isConfirming && (
            <View style={styles.directionSection}>
              <Text style={styles.directionLabel}>Choose a direction:</Text>
              {pathOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.directionCard}
                  onPress={() => handleSelectDirection(opt)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.directionCardLabel}>{opt.label}</Text>
                  {!!opt.description && <Text style={styles.directionCardDesc}>{opt.description}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {isConfirming && (
            <View style={styles.typingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.typingText}>Got it — setting things up...</Text>
            </View>
          )}
        </ScrollView>

        {pathOptions.length === 0 && (
          <View style={styles.footer}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                value={userInput}
                onChangeText={setUserInput}
                onFocus={scrollToEnd}
                placeholder="Type your answer..."
                placeholderTextColor={Colors.textLight}
                multiline
                editable={!isStarting && !isSending}
              />
              <Button title="Send" onPress={handleSend} disabled={!userInput.trim() || isStarting || isSending} style={styles.sendButton} />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  keyboardView: { flex: 1 },
  backButton: { marginLeft: 20, marginTop: 10 },
  header: { alignItems: 'center', marginBottom: 10, paddingHorizontal: 30 },
  emoji: { fontSize: 44, marginBottom: 6 },
  title: { fontSize: 24, fontFamily: Fonts.headingBold, color: Colors.accent, textAlign: 'center' },
  chatScroll: { flex: 1 },
  chatContent: { padding: 20, paddingBottom: 20 },
  contextBox: { backgroundColor: Colors.cardBackground, borderRadius: 12, padding: 16, marginBottom: 16 },
  contextLabel: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  contextText: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textPrimary, lineHeight: 20 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 10 },
  bubbleNatasha: { backgroundColor: Colors.primary, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: Colors.cardBackground, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleGuardrail: { backgroundColor: Colors.warning },
  bubbleText: { fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.white, lineHeight: 22 },
  bubbleTextUser: { color: Colors.textPrimary },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  typingText: { fontSize: 13, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
  directionSection: { marginTop: 16 },
  directionLabel: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  directionCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 10,
  },
  directionCardLabel: { fontSize: 16, fontFamily: Fonts.bodySemiBold, color: Colors.accent, marginBottom: 4 },
  directionCardDesc: { fontSize: 13, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, lineHeight: 18 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.border },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  textInput: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 14,
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 100,
  },
  sendButton: { paddingHorizontal: 20, minHeight: 48 },
});
