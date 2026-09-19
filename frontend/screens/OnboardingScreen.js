/**
 * Onboarding — Natasha's own introduction, shown once right after signup
 * (App.js routes new accounts here before 'consent'; returning logins skip
 * straight past it). Bio text is Natasha Solvason's own words, provided
 * directly — not paraphrased or invented.
 */

import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';

const BIO_PARAGRAPHS = [
  "My name is Natasha Solvason, and I have always had a passion for creating organized, peaceful spaces. Even as a child, I was naturally organized—I would organize my brothers' rooms, and my mom could count on coming home from work to a tidy house!",
  "In December 2009, I turned that lifelong passion into a business when I recognized a growing need for professional organizing services. I wanted to use my natural ability to organize, draw on my previous work experience, and, most importantly, help people create homes that feel calmer, more functional, and easier to manage.",
  "For the past 17 years, my company, Home Free Organizing Solutions, has helped families organize their homes, simplify their spaces, and find practical solutions that work for their everyday lives. Over the years, we have gained a wealth of hands-on experience and learned what truly works when it comes to organizing real homes and real families.",
  "Now, I'm excited to take that expertise beyond our local organizing services and share it with people everywhere through this app. My goal is to make the knowledge and practical organizing solutions we have developed over the past 17 years accessible to more people, wherever they are.",
  "I believe that an organized home isn't about perfection, it's about creating a space that works for you and brings a greater sense of calm to your life.",
];

export default function OnboardingScreen({ goToScreen }) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>A Note From Our Founder</Text>
        <Text style={styles.title}>Welcome to your{'\n'}Home Organization Journey</Text>
        <View style={styles.divider} />

        <View style={styles.letter}>
          {BIO_PARAGRAPHS.map((paragraph, i) => (
            <Text key={i} style={[styles.paragraph, i === 0 && styles.leadParagraph]}>
              {paragraph}
            </Text>
          ))}

          <View style={styles.signatureBlock}>
            <Text style={styles.signatureName}>Natasha Solvason</Text>
            <Text style={styles.signatureTitle}>Founder, Home Free Organizing Solutions</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Get Started"
          onPress={() => goToScreen('consent', { resetHistory: true })}
          style={styles.getStartedButton}
        />
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
    flexGrow: 1,
    padding: 28,
    paddingTop: 40,
    paddingBottom: 40,
  },
  eyebrow: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  title: {
    fontSize: 30,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    lineHeight: 38,
    marginBottom: 20,
  },
  divider: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.secondary,
    marginBottom: 28,
  },
  letter: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 24,
  },
  paragraph: {
    fontSize: 15.5,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    lineHeight: 25,
    marginBottom: 18,
  },
  leadParagraph: {
    fontSize: 17,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    lineHeight: 27,
  },
  signatureBlock: {
    marginTop: 8,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  signatureName: {
    fontSize: 17,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 3,
  },
  signatureTitle: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  getStartedButton: {
    paddingHorizontal: 36,
    minHeight: 50,
  },
});
