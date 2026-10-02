/**
 * Priorities Screen — what matters most to the user for this area. Stored
 * in appData and sent to the backend alongside the user's written
 * intention, so the AI recommendation can actually reflect it (see app.py's
 * _format_priorities_block / generate_area_recommendations).
 *
 * CHANGED (scope): this screen also had a "Visual style (optional)" picker
 * (White / Modern / Wood / Minimal / Colorful) and a "Looks beautiful"
 * priority, both of which fed a "Preferred visual style" line into the AI
 * prompts. This is an organizing app, not an interior design one, so both
 * are gone — every remaining priority is about how the space functions.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import Icon from '../components/Icon';

const PRIORITY_OPTIONS = [
  'Maximize storage',
  'Easy maintenance',
  'Budget friendly',
  'Family friendly',
  'Easy to find things',
];

export default function PrioritiesScreen({ goToScreen, updateData, appData }) {
  const [priorities, setPriorities] = useState(appData.organizationPriorities || []);

  const togglePriority = (option) => {
    setPriorities((prev) =>
      prev.includes(option) ? prev.filter((p) => p !== option) : [...prev, option]
    );
  };

  const handleContinue = () => {
    updateData({ organizationPriorities: priorities });
    goToScreen('intentionQuestion');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="target" size={44} color={Colors.icon} style={styles.emoji} />
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
                style={[styles.chip, styles.chipRow, selected && styles.chipSelected]}
                onPress={() => togglePriority(option)}
                activeOpacity={0.7}
              >
                <Icon name={selected ? 'checkboxChecked' : 'checkboxEmpty'} size={16} color={selected ? Colors.icon : Colors.textLight} style={styles.chipCheckbox} />
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
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipCheckbox: {
    marginRight: 8,
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