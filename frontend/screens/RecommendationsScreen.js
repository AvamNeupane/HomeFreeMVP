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
 * alongside the AI text, each with an icon/reason/Amazon link.
 *
 * CHANGED (back navigation): added a Back button at the top of the screen.
 *
 * Falls back to detectedItems if selectedItems isn't present, so this still
 * works even if ItemSelectionScreen wasn't rebuilt yet.
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, Alert } from 'react-native';
import Markdown from 'react-native-markdown-display';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import Icon from '../components/Icon';
import BackButton from '../components/BackButton';
import AccuracyBadge from '../components/AccuracyBadge';
import ProductCard from '../components/ProductCard';
import { updateRoomStatus } from '../api';
import { ROOM_TYPES } from '../constants/RoomConfig';

export default function RecommendationsScreen({
  goToScreen,
  goBack,
  canGoBack,
  updateData,
  appData,
  apiBaseUrl,
  sessionId
}) {
  const currentRec = appData.currentRecommendation;
  const sessionItems = appData.selectedItems || appData.detectedItems || [];
  const currentItemIndex = appData.currentItemIndex || 0;
  const selectedRooms = appData.selectedRooms || [];
  const currentRoomIndex = appData.currentRoomIndex || 0;
  const currentRoom = appData.currentRoom;

  const hasMoreItems = currentItemIndex < sessionItems.length - 1;
  const hasMoreRooms = currentRoomIndex < selectedRooms.length - 1;

  // Resolves a room key (built-in or custom) to its human-readable name,
  // the same way RoomSelectionScreen's roomNameFor does — needed here to
  // name the room(s) in button copy and confirmation dialogs.
  const roomLabelFor = (key) => {
    if (!key) return '';
    return (ROOM_TYPES[key] || (appData.customRoomConfigs || {})[key] || {}).name || key;
  };
  const currentRoomLabel = appData.currentRoomLabel || roomLabelFor(currentRoom);
  const nextRoomLabel = roomLabelFor(selectedRooms[currentRoomIndex + 1]);

  // Flip the current room's status to 'completed' the moment there are no
  // more selected items left to review for it — this is the room-selection
  // screen's signal that the room is actually done (locked, greyed out)
  // rather than just "started" (resumable). Runs above the early-return
  // below so the hook always fires in the same order every render; the
  // `markedRoomRef` guard stops it from re-firing (and re-PATCHing) on
  // every re-render while this screen stays mounted.
  const markedRoomRef = useRef(null);
  useEffect(() => {
    if (!currentRec || hasMoreItems || !currentRoom) return;
    if (markedRoomRef.current === currentRoom) return;
    markedRoomRef.current = currentRoom;
    updateData({ roomStatuses: { ...(appData.roomStatuses || {}), [currentRoom]: 'completed' } });
    updateRoomStatus(apiBaseUrl, sessionId, currentRoom, 'completed');
  }, [currentRec, hasMoreItems, currentRoom]);

  // CHANGED (crash fix): currentRecommendation can legitimately be null —
  // reachable via "Organize Something Else" on the Final Report after
  // recommendation state was cleared, or a resumed session that never set
  // it. This used to read currentRec.intention with no guard and crash
  // outright; now shows a recoverable screen instead.
  if (!currentRec) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Icon name="question" size={48} color={Colors.icon} style={styles.emptyEmoji} />
          <Text style={styles.emptyTitle}>Nothing to Show Yet</Text>
          <Text style={styles.emptyText}>
            There's no active recommendation right now. Pick an area to organize, or head to your rooms.
          </Text>
          <Button title="Choose an Area" onPress={() => goToScreen('itemSelection')} />
          <Button title="Choose a Room" onPress={() => goToScreen('roomSelection')} variant="outline" style={{ marginTop: 10 }} />
        </View>
      </SafeAreaView>
    );
  }

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

    // CHANGED (flow reorder): Area Photos now runs before Measure Space.
    goToScreen('areaPhoto');
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

  // Always available, not gated on hasMoreRooms — sends the user back to
  // room selection to add an additional room on top of the ones already
  // organized (RoomSelectionScreen appends rather than overwrites). This is
  // the fallback shown in place of "Organize Next Selected Room" once
  // there's no next pre-selected room left to advance to.
  const handleOrganizeAnotherRoom = () => {
    goToScreen('roomSelection');
  };

  // Jumps to the next room the user already picked in Room Selection. If
  // this room still has unorganized areas, warns first rather than silently
  // leaving them behind — those areas stay resumable later either way
  // (Room Selection still shows the room as "in progress"), but the user
  // should get to choose rather than be surprised by it.
  const handleOrganizeNextSelectedRoom = () => {
    if (hasMoreItems) {
      Alert.alert(
        `You still have remaining areas in ${currentRoomLabel} to organize`,
        '',
        [
          { text: `Continue organizing ${currentRoomLabel}`, style: 'cancel' },
          { text: `Skip to ${nextRoomLabel}`, onPress: handleNextRoom },
        ]
      );
      return;
    }
    handleNextRoom();
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

  // CHANGED (skip is final): distinct from handleFinish's "you're done"
  // copy — this path is reachable while areas/rooms are still unfinished,
  // so the confirmation says so explicitly. Skipping is a deliberate,
  // final choice per design decision: the skipped room/areas are NOT
  // revisitable afterward (Room Selection greys them out permanently).
  const handleSkipToReport = () => {
    if (!hasMoreItems && !hasMoreRooms) {
      handleFinish();
      return;
    }
    Alert.alert(
      'Skip the Rest and Finish?',
      'You still have areas or rooms you haven’t organized this session. Skipping now finalizes what you’ve done so far — the parts you skip won’t be revisitable afterward.',
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'Skip & Generate Report',
          style: 'destructive',
          onPress: () => goToScreen('finalReport'),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <BackButton onPress={goBack} visible={canGoBack} />

        <View style={styles.header}>
          <Icon name="sparkle" size={44} color={Colors.icon} style={styles.emoji} />
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
            {hasMoreItems || hasMoreRooms
              ? 'You can organize more areas or rooms now — once you skip ahead to the final report, anything left undone this session is locked in as-is.'
              : 'This room is complete. You can still add another room or area before generating your report.'}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {hasMoreItems ? (
          <Button
            title={`Take Photos of Other Identified Areas in ${currentRoomLabel}`}
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

        {hasMoreRooms ? (
          <Button
            title="Organize Next Selected Room"
            icon="home"
            onPress={handleOrganizeNextSelectedRoom}
            variant="secondary"
            style={styles.secondaryButton}
          />
        ) : (
          <Button
            title="Organize Another Room"
            icon="home"
            onPress={handleOrganizeAnotherRoom}
            variant="secondary"
            style={styles.secondaryButton}
          />
        )}

        <Button
          title="Skip to Final Report"
          onPress={handleSkipToReport}
          variant="outline"
          style={styles.skipButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyEmoji: { fontSize: 60, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontFamily: Fonts.headingBold, color: Colors.accent, marginBottom: 10 },
  emptyText: { fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
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