/**
 * Reusable Button Component
 */

import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Icon from './Icon';

export default function Button({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  icon,
  style
}) {
  
  const getButtonStyle = () => {
    switch (variant) {
      case 'primary':
        return styles.primary;
      case 'secondary':
        return styles.secondary;
      case 'outline':
        return styles.outline;
      default:
        return styles.primary;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'outline':
        return styles.outlineText;
      default:
        return styles.text;
    }
  };

  return (
    <TouchableOpacity 
      style={[
        styles.button,
        getButtonStyle(),
        disabled && styles.disabled,
        style
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? Colors.primary : Colors.white} />
      ) : icon ? (
        <View style={styles.iconRow}>
          <Icon name={icon} size={18} color={variant === 'outline' ? Colors.primary : Colors.white} style={styles.icon} />
          <Text style={[styles.text, getTextStyle()]}>{title}</Text>
        </View>
      ) : (
        <Text style={[styles.text, getTextStyle()]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  secondary: {
    backgroundColor: Colors.secondary,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  disabled: {
    backgroundColor: Colors.border,
    borderColor: Colors.border,
  },
  text: {
    fontSize: 16,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.white,
  },
  outlineText: {
    color: Colors.primary,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
});