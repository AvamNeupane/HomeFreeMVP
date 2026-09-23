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
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking, Alert, SafeAreaView, ScrollView, useWindowDimensions } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Icon from './Icon';

const SUPPORT_EMAIL = 'organizingapp@homefreeorganizing.ca';

// Scales a base-375pt-design pixel value to the current window width,
// clamped so a tiny phone (iPhone SE, ~320-375pt) doesn't get crushed and
// a large phone/tablet doesn't get comically oversized spacing.
const scaleFor = (width) => Math.min(Math.max(width / 375, 0.85), 1.3);

export default function SidebarMenu({ visible, onClose, authUser, isGuestMode, onLogout, onGoHome }) {
  const { width } = useWindowDimensions();
  const scale = scaleFor(width);
  const s = (base) => Math.round(base * scale);
  // CHANGED (panel cut off / not rendering correctly): the previous layout
  // relied on `overlay` being a flexDirection: 'row' container with the
  // panel as its only non-absolute child, sized by a percentage-of-width
  // formula — any interaction between that formula, the row's default
  // flex-start alignment, and RN's layout engine left the panel rendering
  // wrong (clipped/misplaced) on-device even after the earlier flex:1 fix.
  // Switched to explicit absolute positioning pinned to the right edge
  // (matching where the profile button that opens this actually lives).
  // CHANGED (too wide, then too narrow): 320pt/82% left barely any
  // backdrop; 280pt/72% then read as cramped with text crowding the
  // edges. Back to a generous width, but this time paired with real
  // interior padding (bumped below) instead of relying on width alone to
  // create breathing room — width and padding were fighting each other
  // across the last two passes instead of being tuned together.
  const panelWidth = Math.min(330, Math.round(width * 0.82));

  const initial = authUser?.email ? authUser.email.charAt(0).toUpperCase() : 'G';

  // Same unsaved-work check as the tab bar's Home button (App.js's
  // handleHomeTabPress) — passed in as onGoHome rather than duplicated
  // here, so there's exactly one place that decision logic lives.
  const handleGoHome = () => {
    onClose();
    onGoHome?.();
  };

  const contactSupport = async () => {
    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
    } catch (error) {
      Alert.alert('Contact Us', `Please reach out to us at ${SUPPORT_EMAIL}`);
    }
  };

  const handleLogout = () => {
    onClose();
    // A guest has no real session to "log out" of — the button here does
    // the same underlying reset either way (App.js's handleLogout), but
    // the wording and stakes are different: for a guest it's a plain
    // reminder that nothing here was saved, not a destructive confirm.
    if (isGuestMode) {
      Alert.alert(
        'Leave Guest Session?',
        "Your current work hasn't been saved anywhere — leaving now means it's gone. Sign up instead to keep it.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: onLogout },
        ]
      );
      return;
    }
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: onLogout },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <SafeAreaView style={[styles.panel, { width: panelWidth, paddingHorizontal: s(50), paddingTop: s(28) }]}>
          {/* Scrollable so a short screen (or a long help message) never
              clips content or the Log Out button below it — the panel
              itself has no scrolling of its own otherwise. */}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* CHANGED (email crowding the right edge): this had no
                explicit width and a hard 1-line truncation — on the
                narrower panel a longer email had nowhere to go but crowd
                right up against the padded edge (or get ellipsis-cut).
                Giving the section a real bounded width and letting the
                email wrap onto 2 lines fixes both. */}
            <View style={[styles.profileSection, { width: '100%', marginBottom: s(20) }]}>
              <View style={[styles.avatar, { width: s(56), height: s(56), borderRadius: s(28), marginBottom: s(12) }]}>
                <Text style={[styles.avatarText, { fontSize: s(24) }]}>{initial}</Text>
              </View>
              <Text style={[styles.email, { fontSize: s(15), width: '100%' }]} numberOfLines={2}>
                {isGuestMode ? 'Guest Session' : authUser?.email}
              </Text>
              {isGuestMode && (
                <Text style={[styles.guestNote, { fontSize: s(12), marginTop: s(4) }]}>
                  Your work here isn't saved — sign up to keep it.
                </Text>
              )}
            </View>

            <View style={[styles.divider, { marginBottom: s(16) }]} />

            <TouchableOpacity
              style={[styles.menuItem, { paddingVertical: s(12), marginBottom: s(16) }]}
              onPress={handleGoHome}
              activeOpacity={0.7}
            >
              <Icon name="home" size={s(20)} color={Colors.icon} style={styles.menuItemIcon} />
              <Text style={[styles.menuItemText, { fontSize: s(15) }]}>Home</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { marginBottom: s(20) }]} />

            <View style={[styles.helpSection, { borderRadius: s(16), padding: s(20) }]}>
              <Text style={[styles.helpTitle, { fontSize: s(15), marginBottom: s(8) }]}>Need Help?</Text>
              <Text style={[styles.helpText, { fontSize: s(13), lineHeight: s(19), marginBottom: s(12) }]}>
                Our team is happy to help with any questions about your account or your organizing plan.
              </Text>
              <TouchableOpacity onPress={contactSupport} activeOpacity={0.7}>
                <Text style={[styles.helpEmail, { fontSize: s(14) }]}>{SUPPORT_EMAIL}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.logoutButton, { borderRadius: s(14), paddingVertical: s(14), marginBottom: s(24), marginTop: s(16) }]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Text style={[styles.logoutText, { fontSize: s(15) }]}>
              {isGuestMode ? 'Sign Up to Save Your Work' : 'Log Out'}
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  // Absolute + pinned to the right edge, with an explicit fixed-point
  // width computed above — deliberately not relying on any flexbox
  // sizing/stretch behavior for either dimension.
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: Colors.white,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
  guestNote: {
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
  divider: { height: 1, backgroundColor: Colors.border },
  menuItem: { flexDirection: 'row', alignItems: 'center' },
  menuItemIcon: { marginRight: 12 },
  menuItemText: { fontFamily: Fonts.bodySemiBold, color: Colors.textPrimary },
  helpSection: { backgroundColor: Colors.cardBackground },
  helpTitle: { fontFamily: Fonts.bodySemiBold, color: Colors.accent },
  helpText: { fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
  helpEmail: { fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  logoutButton: {
    borderWidth: 1.5,
    borderColor: Colors.error,
    alignItems: 'center',
  },
  logoutText: { fontFamily: Fonts.bodySemiBold, color: Colors.error },
});
