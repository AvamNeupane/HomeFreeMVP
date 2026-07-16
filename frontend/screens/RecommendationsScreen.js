/**
 * Recommendations Screen - Show AI recommendations and ask next steps
 *
 * CHANGED (Task 4): "more areas in this room" now checks against
 * appData.selectedItems (the user's checkbox-filtered list from
 * ItemSelectionScreen) instead of the full appData.detectedItems array.
 * This is what actually makes session length user-controlled — previously
 * the loop walked through every detected area regardless of what the user
 * checked.
 *
 * CHANGED (Task 8): shows the AccuracyBadge so the user sees how their
 * choices so far affect recommendation quality before deciding what's next.
 *
 * CHANGED (always allow organizing more): previously, once you ran out of
 * selected items AND rooms, the only options were "Generate Final Report"
 * or "Skip to Final Report" — there was no way back into the flow to
 * organize something else. Now "Organize Another Area" and "Organize
 * Another Room" are always available, not just while hasMoreItems /
 * hasMoreRooms is true.
 *
 * CHANGED (products): shows the matched product recommendations returned
 * alongside the AI text, each with image/price/reason/Amazon link.
 *
 * CHANGED (back navigation): added a Back button at the top of the screen.
 *
 * Falls back to detectedItems if selectedItems isn't present, so this still
 * works even if ItemSelectionScreen wasn't rebuilt yet.
 */

import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, Alert } from 'react-native';
import Markdown from 'react-native-markdown-display';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import AccuracyBadge from '../components/AccuracyBadge';
import ProductCard from '../components/ProductCard';

export default function RecommendationsScreen({ 
  goToScreen, 
  goBack,
  canGoBack,
  updateData, 
  appData 
}) {
  const currentRec = appData.currentRecommendation;
  const sessionItems = appData.selectedItems || appData.detectedItems || [];
  const currentItemIndex = appData.currentItemIndex || 0;
  const selectedRooms = appData.selectedRooms || [];
  const currentRoomIndex = appData.currentRoomIndex || 0;

  const hasMoreItems = currentItemIndex < sessionItems.length - 1;
  const hasMoreRooms = currentRoomIndex < selectedRooms.length - 1;
  const products = currentRec.products || [];

  const handleNextArea = () => {
    const nextIndex = currentItemIndex + 1;
    const nextItem = sessionItems[nextIndex];
    
    console.log('➡️ Moving to next area:', nextItem.name);
    
    updateData({
      currentItemIndex: nextIndex,
      currentItem: nextItem,
      areaPhotos: []
    });
    
    goToScreen('measureSpace');
  };

  const handleNextRoom = () => {
    const nextRoomIndex = currentRoomIndex + 1;
    const nextRoom = selectedRooms[nextRoomIndex];
    
    console.log('➡️ Moving to next room:', nextRoom);
    
    updateData({
      currentRoomIndex: nextRoomIndex,
      currentRoom: nextRoom,
      roomPhotos: [],
      detectedItems: [],
      selectedItems: [],
      currentItemIndex: 0,
      currentItem: null
    });
    
    goToScreen('photoGuidance');
  };

  // NEW: always available, not gated on hasMoreItems. Sends the user back
  // to pick from the areas already detected in this room (or add a custom
  // one) — a fresh round that appends onto allRecommendations rather than
  // replacing anything already done.
  const handleOrganizeAnotherArea = () => {
    goToScreen('itemSelection');
  };

  // NEW: always available, not gated on hasMoreRooms. Sends the user back
  // to room selection to add an additional room on top of the ones already
  // organized (RoomSelectionScreen appends rather than overwrites).
  const handleOrganizeAnotherRoom = () => {
    goToScreen('roomSelection');
  };

  const handleFinish = () => {
    Alert.alert(
      'Generate Report?',
      'Are you done organizing all areas? We\'ll create your comprehensive report.',
      [
        { text: 'Not Yet', style: 'cancel' },
        { 
          text: 'Yes, Create Report', 
          onPress: () => goToScreen('finalReport')
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <BackButton onPress={goBack} visible={canGoBack} />

        <View style={styles.header}>
          <Text style={styles.emoji}>✨</Text>
          <Text style={styles.title}>Understood!</Text>
          <Text style={styles.subtitle}>
            Here's your personalized action plan
          </Text>
        </View>

        <AccuracyBadge appData={appData} />

        <View style={styles.goalBox}>
          <Text style={styles.goalLabel}>Your Goal:</Text>
          <Text style={styles.goalText}>{currentRec.intention}</Text>
        </View>

        <View style={styles.recommendationsContainer}>
          <Text style={styles.sectionTitle}>Action Plan for {currentRec.area}</Text>
          <Markdown style={markdownStyles}>
            {currentRec.recommendations}
          </Markdown>
        </View>

        {products.length > 0 && (
          <View style={styles.productsSection}>
            <Text style={styles.sectionTitle}>Recommended Products</Text>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </View>
        )}

        <View style={styles.nextStepsBox}>
          <Text style={styles.nextStepsTitle}>What's next?</Text>
          <Text style={styles.nextStepsSubtitle}>
            You can always come back and organize more — nothing here is final.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {hasMoreItems ? (
          <Button 
            title="Continue to Next Area"
            onPress={handleNextArea}
          />
        ) : hasMoreRooms ? (
          <Button 
            title="Continue to Next Room"
            onPress={handleNextRoom}
          />
        ) : (
          <Button 
            title="Generate Final Report"
            onPress={handleFinish}
          />
        )}

        <Button
          title="📦 Organize Another Area"
          onPress={handleOrganizeAnotherArea}
          variant="secondary"
          style={styles.secondaryButton}
        />

        <Button
          title="🏠 Organize Another Room"
          onPress={handleOrganizeAnotherRoom}
          variant="secondary"
          style={styles.secondaryButton}
        />
        
        <Button 
          title="Skip to Final Report"
          onPress={handleFinish}
          variant="outline"
          style={styles.skipButton}
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
  scrollContent: {
    padding: 30,
    paddingBottom: 320,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  emoji: {
    fontSize: 60,
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
  goalBox: {
    backgroundColor: Colors.secondary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
  },
  goalLabel: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  goalText: {
    fontSize: 16,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    lineHeight: 24,
  },
  recommendationsContainer: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 16,
  },
  productsSection: {
    marginBottom: 30,
  },
  nextStepsBox: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
  },
  nextStepsTitle: {
    fontSize: 18,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    marginBottom: 8,
  },
  nextStepsSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
  },
  secondaryButton: {
    marginTop: 0,
  },
  skipButton: {
    marginTop: 0,
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: Fonts.bodyRegular,
  },
  heading1: {
    fontSize: 24,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginTop: 20,
    marginBottom: 12,
  },
  heading2: {
    fontSize: 20,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    marginTop: 16,
    marginBottom: 10,
  },
  heading3: {
    fontSize: 18,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    marginTop: 12,
    marginBottom: 8,
  },
  strong: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
  },
  listItem: {
    marginBottom: 8,
    fontSize: 15,
    lineHeight: 22,
  },
  listUnorderedItemIcon: {
    color: Colors.primary,
  },
  listOrderedItemIcon: {
    color: Colors.primary,
    fontFamily: Fonts.bodySemiBold,
  },
});