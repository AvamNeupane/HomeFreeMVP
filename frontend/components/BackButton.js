/**
 * BackButton — small "‹ Back" pill shown at the top of a screen.
 * Renders nothing if there's nowhere to go back to (visible=false),
 * so screens don't need their own conditional logic.
 *
 * Usage: <BackButton onPress={goBack} visible={canGoBack} />
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';

export default function BackButton({ onPress, visible = true, style }) {
  if (!visible) return null;

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Text style={styles.arrow}>‹</Text>
      <Text style={styles.text}>Back</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  arrow: {
    fontSize: 22,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    marginRight: 2,
    marginTop: -2,
  },
  text: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
});