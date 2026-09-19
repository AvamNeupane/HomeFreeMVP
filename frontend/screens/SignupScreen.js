/**
 * Signup Screen — creates a real account via /auth/signup.
 */

import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import CaptchaChallenge from '../components/CaptchaChallenge';
import Icon from '../components/Icon';
import { fetchWithTimeout } from '../api';

export default function SignupScreen({ apiBaseUrl, onAuthenticated, goToScreen }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const captchaRef = useRef(null);

  const handleSignup = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing Info', 'Please enter your email and a password.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords Don\'t Match', 'Please re-enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const captchaToken = await captchaRef.current.execute();
      const response = await fetchWithTimeout(`${apiBaseUrl}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, captcha_token: captchaToken }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Could not create account');
      }
      await onAuthenticated(data.token, data.user, true);
    } catch (error) {
      const message = error.name === 'AbortError'
        ? `Could not reach the server at ${apiBaseUrl}. Check that the backend is running and your device is on the same network.`
        : error.message;
      Alert.alert('Signup Failed', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Icon name="sparkle" size={56} color={Colors.icon} style={styles.emoji} />
          <Text style={styles.title}>Create Your Account</Text>
          <Text style={styles.subtitle}>Save your progress and pick up right where you left off</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={Colors.textLight}
              secureTextEntry
              autoComplete="password-new"
              textContentType="newPassword"
            />

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              placeholderTextColor={Colors.textLight}
              secureTextEntry
              textContentType="newPassword"
            />
          </View>

          {isSubmitting ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <Button title="Create Account" onPress={handleSignup} style={{ marginTop: 10 }} />
          )}

          <TouchableOpacity onPress={() => goToScreen('login')} style={styles.switchLink}>
            <Text style={styles.switchText}>
              Already have an account? <Text style={styles.switchTextBold}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <CaptchaChallenge ref={captchaRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { flexGrow: 1, padding: 30, justifyContent: 'center' },
  emoji: { fontSize: 60, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 28, fontFamily: Fonts.headingBold, color: Colors.accent, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', marginBottom: 32, paddingHorizontal: 10 },
  form: { marginBottom: 10 },
  label: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.textPrimary, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  // FIX (password dots resize after captcha): secureTextEntry bullet
  // glyphs render inconsistently against a custom font on iOS — they
  // start smaller and jump to the correct (bigger) size on the next
  // blur/refocus, which is exactly what the captcha modal stealing focus
  // triggers. Password fields use the system font instead — a dot looks
  // identical either way, so there's no visual cost.
  passwordInput: { fontFamily: undefined },
  switchLink: { marginTop: 24, alignItems: 'center' },
  switchText: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
  switchTextBold: { fontFamily: Fonts.bodySemiBold, color: Colors.primary },
});
