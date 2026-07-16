/**
 * Intention Question Screen - Ask user about their goals
 *
 * CHANGED (Task 5): the POST body now also includes organization_priorities
 * and visual_style, collected on the new PrioritiesScreen, so the backend
 * can actually use them (see app.py's _format_priorities_block). Without
 * this change, PrioritiesScreen would collect data that never reaches the
 * recommendation prompt.
 */

import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  SafeAreaView, 
  TextInput, 
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';

export default function IntentionQuestionScreen({ 
  goToScreen, 
  updateData, 
  appData,
  apiBaseUrl,
  sessionId
}) {
  const currentQuestion = appData.currentQuestion;
  const currentContext = appData.currentContext;
  const currentItem = appData.currentItem;
  
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async () => {
    if (!userInput.trim()) {
      Alert.alert('Input Required', 'Please share your goals for this area.');
      return;
    }

    if (!sessionId) {
      Alert.alert('Error', 'Session not initialized. Please restart the app.');
      return;
    }

    setIsProcessing(true);

    try {
      console.log('📤 Submitting user intention:', userInput);

      const response = await fetch(`${apiBaseUrl}/area/recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          user_intention: userInput.trim(),
          organization_priorities: appData.organizationPriorities || [],
          visual_style: appData.visualStyle || null
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate recommendations');
      }

      console.log('✅ Recommendations generated');

      // Store recommendations
      const newRecommendation = {
        area: currentItem.name,
        intention: userInput.trim(),
        recommendations: data.recommendations
      };

      const allRecs = [...(appData.allRecommendations || []), newRecommendation];
      
      updateData({
        currentRecommendation: newRecommendation,
        allRecommendations: allRecs
      });

      goToScreen('recommendations');

    } catch (error) {
      console.error('❌ Submission error:', error);
      Alert.alert(
        'Processing Error',
        `Failed to generate recommendations: ${error.message}\n\nPlease try again.`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Quick suggestion options
  const quickSuggestions = [
    '🧹 I want to declutter and tidy up',
    '✨ I want to make it more beautiful',
    '📦 I need better organization',
    '🎯 I want to maximize space',
  ];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.emoji}>💭</Text>
            <Text style={styles.title}>One quick question...</Text>
          </View>

          {currentContext && (
            <View style={styles.contextBox}>
              <Text style={styles.contextLabel}>What we see:</Text>
              <Text style={styles.contextText}>{currentContext}</Text>
            </View>
          )}

          <View style={styles.questionBox}>
            <Text style={styles.question}>{currentQuestion}</Text>
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Your answer:</Text>
            <TextInput
              style={styles.textInput}
              value={userInput}
              onChangeText={setUserInput}
              placeholder="Type your goals here..."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.suggestionsSection}>
            <Text style={styles.suggestionsLabel}>Quick options:</Text>
            {quickSuggestions.map((suggestion, index) => (
              <Button
                key={index}
                title={suggestion}
                onPress={() => setUserInput(suggestion.split(' ').slice(1).join(' '))}
                variant="outline"
                style={styles.suggestionButton}
              />
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.processingText}>
                Generating personalized recommendations...
              </Text>
            </View>
          ) : (
            <Button 
              title="Submit"
              onPress={handleSubmit}
              disabled={!userInput.trim()}
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
    padding: 30,
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  emoji: {
    fontSize: 60,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    textAlign: 'center',
  },
  contextBox: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  contextLabel: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  contextText: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  questionBox: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
  },
  question: {
    fontSize: 18,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.white,
    lineHeight: 26,
  },
  inputSection: {
    marginBottom: 30,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    minHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  suggestionsSection: {
    gap: 10,
  },
  suggestionsLabel: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  suggestionButton: {
    marginBottom: 0,
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
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});