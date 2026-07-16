/**
 * Consent Screen — must be the first screen the user sees. No camera or
 * photo-library permission request happens anywhere in the app until this
 * screen's "I Agree, Continue" button has been pressed.
 */

import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';

export default function ConsentScreen({ goToScreen, updateData }) {
  const handleAgree = () => {
    updateData({ consentGiven: true });
    goToScreen('welcome');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.emoji}>🔒</Text>
          <Text style={styles.title}>Before we get started</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What we collect</Text>
          <Text style={styles.bodyText}>
            To build your organization plan, RoomScan AI collects the room and
            close-up photos you choose to take, any measurements you enter, the
            room type and priorities you select, and your written goals for
            each space.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How it's used</Text>
          <Text style={styles.bodyText}>
            Photos and measurements are sent to our AI provider to generate
            recommendations for the areas you choose, and are saved with your
            project so you can resume later. You can skip photos or
            measurements at any time — nothing here is required to get a
            basic recommendation.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your control</Text>
          <Text style={styles.bodyText}>
            Camera and photo-library access will only be requested at the
            moment you choose to take or select a photo — never before, and
            never without your explicit action.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="I Agree, Continue" onPress={handleAgree} />
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
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    lineHeight: 22,
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
});