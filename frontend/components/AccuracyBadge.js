/**
 * AccuracyBadge — shows the user how personalized their recommendations will be,
 * derived entirely from state that already exists in appData (no new API calls).
 *
 * Basic     = no measurements taken yet for any selected area
 * Good      = some, but not all, selected areas have been measured
 * Excellent = every selected area has been measured
 *
 * Usage: <AccuracyBadge appData={appData} />
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';

function computeAccuracy(appData) {
  const totalAreas =
    (appData.selectedItems && appData.selectedItems.length) ||
    (appData.detectedItems && appData.detectedItems.length) ||
    0;

  const measurements = appData.areaMeasurements || {};
  const measuredCount = Object.values(measurements).filter(
    (m) => m && !m.skipped && Array.isArray(m.shelfProfiles) && m.shelfProfiles.length > 0
  ).length;

  if (totalAreas === 0 || measuredCount === 0) {
    return {
      level: 'Basic',
      message: 'Photo only — recommendations will be general',
      color: Colors.textSecondary,
    };
  }

  if (measuredCount < totalAreas) {
    return {
      level: 'Good',
      message: `${measuredCount} of ${totalAreas} areas measured — recommendations getting more personalized`,
      color: Colors.primary,
    };
  }

  return {
    level: 'Excellent',
    message: 'All selected areas measured — most personalized recommendations',
    color: Colors.accent,
  };
}

export default function AccuracyBadge({ appData }) {
  const { level, message, color } = computeAccuracy(appData);

  return (
    <View style={[styles.container, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.textBlock}>
        <Text style={[styles.level, { color }]}>{level} accuracy</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    backgroundColor: Colors.cardBackground,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  textBlock: {
    flex: 1,
  },
  level: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
});