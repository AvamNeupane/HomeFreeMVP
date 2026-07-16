/**
 * Priorities Screen — what matters most to the user for this area, and
 * optionally a preferred visual style. Both are stored in appData and sent
 * to the backend alongside the user's written intention, so the AI
 * recommendation can actually reflect them (see app.py's
 * _format_priorities_block / generate_area_recommendations).
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';

const PRIORITY_OPTIONS = [
  'Maximize storage',
  'Easy maintenance',
  'Budget friendly',
  'Family friendly',
  'Looks beautiful',
];

const STYLE_OPTIONS = ['White', 'Modern', 'Wood', 'Minimal', 'Colorful'];

export default function PrioritiesScreen({ goToScreen, updateData, appData }) {
  const [priorities, setPriorities] = useState(appData.organizationPriorities || []);
  const [visualStyle, setVisualStyle] = useState(appData.visualStyle || null);

  const togglePriority = (option) => {
    setPriorities((prev) =>
      prev.includes(option) ? prev.filter((p) => p !== option) : [...prev, option]
    );
  };

  const selectStyle = (option) => {
    setVisualStyle((prev) => (prev === option ? null : option));
  };

  const handleContinue = () => {
    updateData({
      organizationPriorities: priorities,
      visualStyle: visualStyle,
    });
    goToScreen('intentionQuestion');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.emoji}>🎯</Text>
          <Text style={styles.title}>What matters most?</Text>
          <Text style={styles.subtitle}>
            Pick as many as apply — this is optional but helps us tailor advice.
          </Text>
        </View>

        <View style={styles.chipGrid}>
          {PRIORITY_OPTIONS.map((option) => {
            const selected = priorities.includes(option);
            return (
              <TouchableOpacity
                key={option}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => togglePriority(option)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {selected ? '☑ ' : '☐ '}
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.header}>
          <Text style={styles.subtitle2}>Visual style (optional)</Text>
        </View>

        <View style={styles.chipGrid}>
          {STYLE_OPTIONS.map((option) => {
            const selected = visualStyle === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => selectStyle(option)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Continue" onPress={handleContinue} />
        <Button title="Skip" onPress={handleContinue} variant="outline" style={styles.skipButton} />
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
    paddingBottom: 160,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  subtitle2: {
    fontSize: 16,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
    justifyContent: 'center',
  },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  chipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  chipText: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
  },
  chipTextSelected: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
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
    gap: 10,
  },
  skipButton: {
    marginTop: 0,
  },
});