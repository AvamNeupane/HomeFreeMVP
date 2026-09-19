/**
 * SidebarMenu — slide-in panel with the account's profile, session
 * controls, a contact/help section, and logout. Opened from a small
 * profile button in App.js's tab bar; the two-tab strip (Home/Projects)
 * stays the only persistent nav, this is an on-demand overlay, not a third
 * tab.
 *
 * CHANGED (responsive spacing): every measurement used to be a fixed
 * pixel value tuned for one phone size, which read as cramped on an
 * iPhone SE and oddly sparse on a Pro Max/tablet. Spacing now scales off
 * the actual window width (clamped so it never gets silly-small or
 * silly-large), and bottom padding adds the real safe-area inset instead
 * of a guessed constant — needed on gesture-nav Android devices in
 * particular.
 *
 * CHANGED (removed Restart Session): this used to sit here alongside Log
 * Out, but it did the exact same thing as the newer, more discoverable
 * "Start a New Project" (Home screen + Projects tab) — two differently-
 * worded buttons for one action was exactly the confusion testers reported
 * ("Restart Session" isn't the same as starting a new project, and I didn't
 * want to restart my existing session"). One clearly-labeled entry point
 * beats two ambiguous ones.
 */

import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking, Alert, SafeAreaView, useWindowDimensions } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';

const SUPPORT_EMAIL = 'organizingapp@homefreeorganizing.ca';

// Scales a base-375pt-design pixel value to the current window width,
// clamped so a tiny phone (iPhone SE, ~320-375pt) doesn't get crushed and
// a large phone/tablet doesn't get comically oversized spacing.
const scaleFor = (width) => Math.min(Math.max(width / 375, 0.85), 1.3);

export default function SidebarMenu({ visible, onClose, authUser, onLogout }) {
  const { width } = useWindowDimensions();
  const scale = scaleFor(width);
  const s = (base) => Math.round(base * scale);

  const initial = (authUser?.email || '?').charAt(0).toUpperCase();

  const contactSupport = async () => {
    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
    } catch (error) {
      Alert.alert('Contact Us', `Please reach out to us at ${SUPPORT_EMAIL}`);
    }
  };

  const handleLogout = () => {
    onClose();
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: onLogout },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <SafeAreaView style={[styles.panel, { width: `${Math.min(Math.max((320 / width) * 100, 72), 82)}%`, paddingHorizontal: s(24), paddingTop: s(24) }]}>
          <View style={[styles.profileSection, { marginBottom: s(20) }]}>
            <View style={[styles.avatar, { width: s(56), height: s(56), borderRadius: s(28), marginBottom: s(12) }]}>
              <Text style={[styles.avatarText, { fontSize: s(24) }]}>{initial}</Text>
            </View>
            <Text style={[styles.email, { fontSize: s(15) }]} numberOfLines={1}>{authUser?.email}</Text>
          </View>

          <View style={[styles.divider, { marginBottom: s(24) }]} />

          <View style={[styles.helpSection, { borderRadius: s(16), padding: s(18) }]}>
            <Text style={[styles.helpTitle, { fontSize: s(15), marginBottom: s(8) }]}>Need Help?</Text>
            <Text style={[styles.helpText, { fontSize: s(13), lineHeight: s(19), marginBottom: s(12) }]}>
              Our team is happy to help with any questions about your account or your organizing plan.
            </Text>
            <TouchableOpacity onPress={contactSupport} activeOpacity={0.7}>
              <Text style={[styles.helpEmail, { fontSize: s(14) }]}>{SUPPORT_EMAIL}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.spacer} />

          <TouchableOpacity
            style={[styles.logoutButton, { borderRadius: s(14), paddingVertical: s(14), marginBottom: s(24) }]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Text style={[styles.logoutText, { fontSize: s(15) }]}>Log Out</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  panel: {
    backgroundColor: Colors.white,
    flex: 1,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.overlay,
  },
  profileSection: { alignItems: 'flex-start' },
  avatar: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Fonts.headingBold,
    color: Colors.white,
  },
  email: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  divider: { height: 1, backgroundColor: Colors.border },
  helpSection: { backgroundColor: Colors.cardBackground },
  helpTitle: { fontFamily: Fonts.bodySemiBold, color: Colors.accent },
  helpText: { fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
  helpEmail: { fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  spacer: { flex: 1 },
  logoutButton: {
    borderWidth: 1.5,
    borderColor: Colors.error,
    alignItems: 'center',
  },
  logoutText: { fontFamily: Fonts.bodySemiBold, color: Colors.error },
});
