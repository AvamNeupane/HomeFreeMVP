/**
 * Welcome Screen - Initial landing page
 *
 * CHANGED (unreachable logout / cramped layout): this screen used to be a
 * fixed-height View with no ScrollView, relying on justifyContent:
 * 'space-between' to spread hero/features/button across the screen — on a
 * shorter device that compressed everything, and the small "Log out" link
 * sat right under the Get Started button with barely any separation,
 * making it hard to tap reliably. Logout now lives only in the sidebar
 * (it already has a proper confirm dialog there), and this screen scrolls
 * like every other screen in the app so nothing gets clipped or crowded
 * on a smaller phone.
 */

import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, useWindowDimensions, Alert } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import Icon from '../components/Icon';

export default function WelcomeScreen({ goToScreen, appData, resetAppData }) {
  const { height } = useWindowDimensions();
  // CHANGED (Home tab redesign): tapping the "Home" tab used to just show
  // whatever screen you happened to leave the flow on — e.g. still inside
  // a bedroom's photo step — with no obvious way back to a stable landing
  // point. Home now always lands here, and this screen tells the two
  // cases apart: genuinely nothing started yet (first visit) vs. returning
  // with an in-progress room, which gets both a "pick up where I left off"
  // and a "start something new" option instead of only one path forward.
  const hasProgress = !!(appData?.currentRoom || (appData?.selectedRooms || []).length > 0);

  const handleStartNewProject = () => {
    Alert.alert(
      'Start a New Project?',
      'This clears your current progress and starts a brand new project. Your existing project stays saved and is still available from the Projects tab.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start New', onPress: () => resetAppData?.() },
      ]
    );
  };
  // A big fixed top margin looked fine on a tall phone and pushed
  // everything toward the bottom fold on a short one. Scaling it off the
  // window height (with a sensible floor/ceiling) keeps the hero looking
  // intentional across device sizes instead of picking one phone to
  // design for.
  const heroMarginTop = Math.min(Math.max(height * 0.05, 24), 60);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroSection, { marginTop: heroMarginTop }]}>
          <Icon name="home" size={72} color={Colors.icon} style={styles.heroIcon} />
          <Text style={styles.title}>{hasProgress ? 'Welcome Back' : 'Welcome Home'}</Text>
          <Text style={styles.subtitle}>
            {hasProgress
              ? 'Pick up where you left off, or start something new.'
              : "Let's organize your space and make it beautiful"}
          </Text>
        </View>

        {!hasProgress && (
          <View style={styles.features}>
            <View style={styles.feature}>
              <Icon name="ruler" size={30} color={Colors.icon} style={styles.featureIcon} />
              <Text style={styles.featureText}>Guided space measurements</Text>
            </View>
            <View style={styles.feature}>
              <Icon name="camera" size={30} color={Colors.icon} style={styles.featureIcon} />
              <Text style={styles.featureText}>Guided photo capture</Text>
            </View>
            <View style={styles.feature}>
              <Icon name="robot" size={30} color={Colors.icon} style={styles.featureIcon} />
              <Text style={styles.featureText}>AI-powered analysis</Text>
            </View>
            <View style={styles.feature}>
              <Icon name="sparkle" size={30} color={Colors.icon} style={styles.featureIcon} />
              <Text style={styles.featureText}>Personalized recommendations</Text>
            </View>
            <View style={styles.feature}>
              <Icon name="clipboard" size={30} color={Colors.icon} style={styles.featureIcon} />
              <Text style={styles.featureText}>Downloadable action plan</Text>
            </View>
          </View>
        )}

        <View style={styles.buttonContainer}>
          {hasProgress ? (
            <>
              <Button
                title="Continue Organizing"
                onPress={() => goToScreen('roomSelection')}
                variant="primary"
              />
              <Button
                title="Start a New Project"
                onPress={handleStartNewProject}
                variant="outline"
                style={styles.secondaryButton}
              />
            </>
          ) : (
            <Button
              title="Get Started"
              // A genuinely fresh start (never true for "Continue
              // Organizing" above, which is always resuming something) —
              // name the project before picking a room, so any later
              // "Continue Your Project?" prompt can actually say what
              // this project is instead of just listing its rooms.
              onPress={() => goToScreen('projectName')}
              variant="primary"
            />
          )}
        </View>
      </ScrollView>
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
    justifyContent: 'space-between',
    padding: 30,
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
  },
  heroIcon: {
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
    marginVertical: 30,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    marginRight: 16,
  },
  featureText: {
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    flex: 1,
  },
  buttonContainer: {
    marginTop: 10,
  },
  secondaryButton: {
    marginTop: 12,
  },
});
