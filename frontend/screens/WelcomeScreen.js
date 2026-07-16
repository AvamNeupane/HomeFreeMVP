/**
 * Welcome Screen - Initial landing page
 */

import React from 'react';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';

export default function WelcomeScreen({ goToScreen }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <Text style={styles.emoji}>🏠</Text>
          <Text style={styles.title}>Welcome Home</Text>
          <Text style={styles.subtitle}>
            Let's organize your space and make it beautiful
          </Text>
        </View>
        
        <View style={styles.features}>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>📏</Text>
            <Text style={styles.featureText}>Guided space measurements</Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>📸</Text>
            <Text style={styles.featureText}>Guided photo capture</Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>🤖</Text>
            <Text style={styles.featureText}>AI-powered analysis</Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>✨</Text>
            <Text style={styles.featureText}>Personalized recommendations</Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>📋</Text>
            <Text style={styles.featureText}>Downloadable action plan</Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <Button 
            title="Get Started"
            onPress={() => goToScreen('roomSelection')}
            variant="primary"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    padding: 30,
    justifyContent: 'space-between',
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 60,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 42,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 26,
  },
  features: {
    gap: 24,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    fontSize: 32,
    marginRight: 16,
    width: 40,
  },
  featureText: {
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    flex: 1,
  },
  buttonContainer: {
    marginBottom: 20,
  },
});