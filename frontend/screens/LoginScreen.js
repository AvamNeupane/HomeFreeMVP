/**
 * Login Screen — real email/password check against the backend (/auth/login).
 * On success, calls onAuthenticated(token, user) so App.js can store the
 * session and move on.
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

export default function LoginScreen({ apiBaseUrl, onAuthenticated, goToScreen }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const captchaRef = useRef(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing Info', 'Please enter your email and password.');
      return;
    }
    setIsSubmitting(true);
    try {
      const captchaToken = await captchaRef.current.execute();
      const response = await fetchWithTimeout(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, captcha_token: captchaToken }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Incorrect email or password');
      }
      await onAuthenticated(data.token, data.user);
    } catch (error) {
      const message = error.name === 'AbortError'
        ? `Could not reach the server at ${apiBaseUrl}. Check that the backend is running and your device is on the same network.`
        : error.message;
      Alert.alert('Login Failed', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Icon name="home" size={56} color={Colors.icon} style={styles.emoji} />
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Log in to continue organizing your home</Text>

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
              placeholder="••••••••"
              placeholderTextColor={Colors.textLight}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
            />
          </View>

          {isSubmitting ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <Button title="Log In" onPress={handleLogin} style={{ marginTop: 10 }} />
          )}

          <TouchableOpacity onPress={() => goToScreen('signup')} style={styles.switchLink}>
            <Text style={styles.switchText}>
              Don't have an account? <Text style={styles.switchTextBold}>Sign up</Text>
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
  title: { fontSize: 30, fontFamily: Fonts.headingBold, color: Colors.accent, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', marginBottom: 32 },
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
  // FIX (password dots resize after captcha) — see SignupScreen.js for the
  // full explanation: secureTextEntry + a custom font renders bullets at
  // the wrong size until the next blur/refocus. System font sidesteps it.
  passwordInput: { fontFamily: undefined },
  switchLink: { marginTop: 24, alignItems: 'center' },
  switchText: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
  switchTextBold: { fontFamily: Fonts.bodySemiBold, color: Colors.primary },
});
