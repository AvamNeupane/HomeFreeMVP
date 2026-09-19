/**
 * Measure Your Space — interior-aware + natural-language measurement entry.
 *
 * CHANGED (interior-aware planning): now runs AFTER Area Photos (see the
 * flow-reorder note in AreaPhotoScreen.js), and opens by sending those
 * photos to /area/measurement-plan. The AI looks at the actual close-ups
 * to decide whether this object has an interior worth measuring (closets/
 * cabinets/cupboards/drawers always do — see backend PRIORITY_INTERIOR_
 * OBJECTS — plus anything visually similar), and if so, visually counts
 * the shelves/compartments it can see:
 *   - High confidence  -> "We see N — is that right?" with an editable
 *     stepper before moving on.
 *   - Low confidence    -> two explicit choices: "Add More Photos" (routes
 *     back to Area Photos, which seeds from what's already captured) or
 *     "I'll Tell You" (plain manual count).
 *   - No interior       -> outer L/W/H is offered but clearly framed as
 *     optional, with Skip as a first-class button, not a fallback.
 *
 * From there, the existing free-text -> /area/parse-measurement -> confirm
 * -> /area/measurements pipeline is unchanged — this only changes *how the
 * screen gets there*, primed with whatever compartment count was settled
 * on. "Add Another Size" still supports multiple distinct sizes in one
 * area natively via the free-text parser.
 *
 * AR scanning (where available) still works as a shortcut for outer
 * dimensions: a successful scan pre-fills the free-text box in plain
 * English so it flows through the same parse -> confirm pipeline.
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TextInput,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Colors from '../constants/Colors';
import Icon from '../components/Icon';
import { apiFetch, appendImageFile } from '../api';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import AccuracyBadge from '../components/AccuracyBadge';
import ARMeasurementModule, { isARMeasurementAvailable } from '../native/ARMeasurementModule';
import { MEASUREMENT_UNITS } from '../constants/MeasurementConfig';

const METERS_TO_UNIT = {
  in: (m) => m / 0.0254,
  cm: (m) => m * 100,
};

export default function MeasureSpaceScreen({
  goToScreen,
  goBack,
  canGoBack,
  updateData,
  appData,
  apiBaseUrl,
  sessionId,
}) {
  const currentItem = appData.currentItem;
  const areaName = currentItem?.name || 'this space';

  // 'loading' | 'confirm-count' | 'uncertain' | 'manual-count' | 'intro' |
  // 'input' | 'parsing' | 'confirm' | 'saving'
  const [phase, setPhase] = useState('loading');
  const [unit, setUnit] = useState('in');
  const [relevantFields, setRelevantFields] = useState([]);
  const [hasInterior, setHasInterior] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(null);
  const [countInput, setCountInput] = useState('1');
  const [measurementText, setMeasurementText] = useState('');
  const [parsedProfiles, setParsedProfiles] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    loadMeasurementPlan();
  }, []);

  const loadMeasurementPlan = async () => {
    setPhase('loading');
    setLoadError(null);
    try {
      const photoSource = Object.keys(appData.areaPhotos || {}).length > 0 ? appData.areaPhotos : appData.roomPhotos;
      // photoSource is keyed by category -> array of uris (a category can
      // hold more than one photo now), so this needs flattening before
      // it's a plain list of uri strings — passing an array as a FormData
      // `uri` field crashes the upload.
      const photoUris = Object.values(photoSource || {}).flat().filter(Boolean);

      const formData = new FormData();
      if (sessionId) formData.append('session_id', sessionId);
      formData.append('area_name', areaName);
      formData.append('room_type', appData.currentRoomLabel || appData.currentRoom || '');
      photoUris.forEach((uri, i) => {
        appendImageFile(formData, `image${i}`, uri, `plan_${i}.jpg`);
      });

      const response = await apiFetch(`${apiBaseUrl}/area/measurement-plan`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to plan measurements');
      }

      setRelevantFields(data.fields || []);
      setHasInterior(!!data.has_interior);

      if (data.has_interior && data.count_confidence === 'high' && data.compartment_count) {
        setConfirmedCount(data.compartment_count);
        setCountInput(String(data.compartment_count));
        setPhase('confirm-count');
      } else if (data.has_interior) {
        setPhase('uncertain');
      } else {
        setPhase('intro');
      }
    } catch (error) {
      console.error('❌ Measurement plan error:', error);
      setLoadError(error.message);
      setPhase('intro'); // still let the user proceed with generic guidance
    }
  };

  const handleARScan = async () => {
    setIsScanning(true);
    try {
      // Native module contract uses width/depth/height — kept as-is here,
      // only the text we generate from it is relabeled to length/width.
      const meters = await ARMeasurementModule.launchARScanner(['width', 'depth', 'height']);
      const toUnit = METERS_TO_UNIT[unit];
      const parts = [];
      if (typeof meters.width === 'number') parts.push(`length ${toUnit(meters.width).toFixed(1)}`);
      if (typeof meters.depth === 'number') parts.push(`width ${toUnit(meters.depth).toFixed(1)}`);
      if (typeof meters.height === 'number') parts.push(`height ${toUnit(meters.height).toFixed(1)}`);
      setMeasurementText(parts.join(', '));
      setPhase('input');
    } catch (error) {
      if (error.code === 'MANUAL_ENTRY_REQUESTED') {
        setPhase('input');
      } else if (error.code === 'USER_CANCELLED') {
        // stay put
      } else {
        Alert.alert('AR Scan Unavailable', error.message || 'Could not start the AR scanner. You can still measure manually below.', [{ text: 'OK' }]);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleParse = async () => {
    if (!measurementText.trim()) {
      Alert.alert('Nothing to Parse', 'Describe at least one measurement first.');
      return;
    }
    setPhase('parsing');
    try {
      const response = await apiFetch(`${apiBaseUrl}/area/parse-measurement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area_name: areaName,
          text: measurementText.trim(),
          relevant_fields: relevantFields,
          unit,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse your measurements');
      }
      if (!data.shelf_profiles || data.shelf_profiles.length === 0) {
        Alert.alert(
          'Couldn’t Parse That',
          'We couldn’t find any measurements in what you typed. Try something like "Length 50 inch, Height 25 inch, Width 34".'
        );
        setPhase('input');
        return;
      }
      setParsedProfiles((prev) => [...prev, ...data.shelf_profiles]);
      setMeasurementText('');
      setPhase('confirm');
    } catch (error) {
      console.error('❌ Parse measurement error:', error);
      Alert.alert('Error', error.message, [{ text: 'OK' }]);
      setPhase('input');
    }
  };

  const removeProfile = (index) => {
    setParsedProfiles((prev) => prev.filter((_, i) => i !== index));
  };

  const saveAndContinue = async (profiles, skipped = false) => {
    setPhase('saving');
    const measurementData = { areaName, roomType: appData.currentRoom, unit, shelfProfiles: profiles, skipped };
    updateData({ areaMeasurements: { ...(appData.areaMeasurements || {}), [areaName]: measurementData } });

    if (sessionId) {
      try {
        const response = await apiFetch(`${apiBaseUrl}/area/measurements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            area_name: areaName,
            room_type: appData.currentRoom,
            unit,
            shelf_profiles: profiles,
            skipped,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save measurements');
      } catch (error) {
        console.error('Measurement save error:', error);
        Alert.alert(
          'Save Warning',
          'Measurements saved locally but could not sync to server. They will still appear in your summary.',
          [{ text: 'Continue', onPress: () => goToScreen('intentionQuestion') }]
        );
        return;
      }
    }
    goToScreen('intentionQuestion');
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Measurements?',
      'Without measurements, product recommendations in your final report will be less precise. You can always measure later.',
      [
        { text: 'Go Back', style: 'cancel' },
        { text: 'Skip Anyway', style: 'destructive', onPress: () => saveAndContinue([], true) },
      ]
    );
  };

  const confirmCountAndProceed = (count) => {
    setConfirmedCount(count);
    setPhase('input');
  };

  const unitSymbol = MEASUREMENT_UNITS[unit].symbol;

  const renderUnitToggle = () => (
    <View style={styles.unitToggle}>
      {Object.entries(MEASUREMENT_UNITS).map(([key, { label }]) => (
        <TouchableOpacity key={key} style={[styles.unitOption, unit === key && styles.unitOptionActive]} onPress={() => setUnit(key)}>
          <Text style={[styles.unitOptionText, unit === key && styles.unitOptionTextActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderLoading = (label) => (
    <View style={styles.centerBox}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );

  const renderCountStepper = (value, onChange) => (
    <View style={styles.countRow}>
      <TouchableOpacity style={styles.countButton} onPress={() => onChange(String(Math.max(1, (parseInt(value, 10) || 1) - 1)))}>
        <Text style={styles.countButtonText}>−</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.countInput}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        textAlign="center"
      />
      <TouchableOpacity style={styles.countButton} onPress={() => onChange(String((parseInt(value, 10) || 0) + 1))}>
        <Text style={styles.countButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );

  const renderConfirmCount = () => (
    <>
      <View style={styles.header}>
        <Icon name="search" size={40} color={Colors.icon} style={styles.emoji} />
        <Text style={styles.title}>Quick Check</Text>
        <Text style={styles.subtitle}>
          We see <Text style={styles.subtitleBold}>{countInput}</Text> shelves/compartments in your {areaName.toLowerCase()} — is that right?
        </Text>
      </View>
      {renderCountStepper(countInput, setCountInput)}
      <Text style={styles.tipTextCenter}>Adjust the number above if we miscounted, then continue.</Text>
    </>
  );

  const renderUncertain = () => (
    <View style={styles.header}>
      <Icon name="question" size={40} color={Colors.icon} style={styles.emoji} />
      <Text style={styles.title}>How Many Shelves?</Text>
      <Text style={styles.subtitle}>
        We're not totally sure how many shelves or compartments your {areaName.toLowerCase()} has from the photos we have.
      </Text>
    </View>
  );

  const renderManualCount = () => (
    <>
      <View style={styles.header}>
        <Icon name="pencil" size={40} color={Colors.icon} style={styles.emoji} />
        <Text style={styles.title}>How Many?</Text>
        <Text style={styles.subtitle}>How many separate shelves/compartments does your {areaName.toLowerCase()} have?</Text>
      </View>
      {renderCountStepper(countInput, setCountInput)}
    </>
  );

  const renderIntro = () => (
    <>
      <View style={styles.header}>
        <Icon name="ruler" size={40} color={Colors.icon} style={styles.emoji} />
        <Text style={styles.title}>Measure Your Space</Text>
        <Text style={styles.subtitle}>
          {hasInterior
            ? `Tell us the measurements for your ${areaName.toLowerCase()} in your own words.`
            : `This doesn't look like it needs interior measurements — want to add its overall size anyway? Totally optional.`}
        </Text>
        <View style={styles.areaBadge}><Text style={styles.areaBadgeText}>{areaName}</Text></View>
      </View>

      {isARMeasurementAvailable() && (
        <View style={styles.arBox}>
          <View style={styles.arBoxTitleRow}>
            <Icon name="scan" size={18} color={Colors.accent} style={styles.arBoxTitleIcon} />
            <Text style={styles.arBoxTitle}>Point your camera at the space</Text>
          </View>
          <Text style={styles.arBoxSubtitle}>Scan with your camera to pre-fill outside dimensions — you can still add more by typing.</Text>
        </View>
      )}

      {relevantFields.length > 0 && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Relevant for this item:</Text>
          {relevantFields.map((f) => (
            <Text key={f.key} style={styles.infoItem}>• {f.label}</Text>
          ))}
        </View>
      )}
      {loadError && (
        <Text style={styles.loadErrorText}>Couldn’t ask the AI which fields matter here ({loadError}) — describe whatever you measured below.</Text>
      )}

      {renderUnitToggle()}

      <View style={styles.exampleBox}>
        <Text style={styles.exampleTitle}>For example</Text>
        <Text style={styles.exampleLine}>Length 50 inch, Height 25 inch, Width 34</Text>
        <Text style={styles.exampleLine}>If an object with multiple L×W×H: Inside Length 40 inch. Inside Width 31 inch</Text>
        <Text style={styles.exampleNote}>You can also describe everything relevant in plain English.</Text>
      </View>
    </>
  );

  const renderInput = () => (
    <>
      <Text style={styles.fieldLabel}>Describe your measurements</Text>
      <Text style={styles.instruction}>
        {confirmedCount
          ? `Since you have ${confirmedCount} shelf${confirmedCount === 1 ? '' : 's'}/compartment${confirmedCount === 1 ? '' : 's'}, describe each one's inside dimensions — they can be the same or different sizes.`
          : `Type freely, in ${unit === 'in' ? 'inches' : 'centimeters'} — say which dimension is which.`}
      </Text>
      {relevantFields.length > 0 && (
        <View style={styles.chipRow}>
          {relevantFields.map((f) => (
            <View key={f.key} style={styles.fieldChip}><Text style={styles.fieldChipText}>{f.label}</Text></View>
          ))}
        </View>
      )}
      <View style={styles.exampleBox}>
        <Text style={styles.exampleTitle}>For example</Text>
        <Text style={styles.exampleLine}>Length 50 inch, Height 25 inch, Width 34</Text>
        <Text style={styles.exampleLine}>If an object with multiple L×W×H: Inside Length 40 inch. Inside Width 31 inch</Text>
        <Text style={styles.exampleNote}>You can also describe everything relevant in plain English.</Text>
      </View>
      <TextInput
        style={styles.textArea}
        value={measurementText}
        onChangeText={setMeasurementText}
        placeholder="e.g. Length 50 inch, Height 25 inch, Width 34. Inside Length 40 inch, Inside Width 31 inch."
        placeholderTextColor={Colors.textLight}
        multiline
        autoFocus
      />
      {renderUnitToggle()}
    </>
  );

  const renderConfirm = () => (
    <>
      <Text style={styles.fieldLabel}>Here's what we got</Text>
      <Text style={styles.instruction}>Confirm this looks right, add another size, or save.</Text>

      {parsedProfiles.map((profile, i) => (
        <View key={i} style={styles.profileCard}>
          <View style={{ flex: 1 }}>
            {Object.entries(profile).filter(([k]) => k !== 'count').map(([key, value]) => (
              <Text key={key} style={styles.profileLine}>
                {fieldLabelFor(key, relevantFields)}: {value} {unitSymbol}
              </Text>
            ))}
            <Text style={styles.profileCount}>{profile.count || 1} of this size</Text>
          </View>
          <TouchableOpacity onPress={() => removeProfile(i)} style={styles.profileRemove}>
            <Icon name="close" size={14} color={Colors.error} strokeWidth={14} />
          </TouchableOpacity>
        </View>
      ))}
    </>
  );

  const footerVisible = ['confirm-count', 'uncertain', 'manual-count', 'intro', 'input', 'confirm'].includes(phase);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <BackButton onPress={goBack} visible={canGoBack} />
        <AccuracyBadge appData={appData} />

        {phase === 'loading' && renderLoading('Looking at your photos...')}
        {phase === 'confirm-count' && renderConfirmCount()}
        {phase === 'uncertain' && renderUncertain()}
        {phase === 'manual-count' && renderManualCount()}
        {phase === 'intro' && renderIntro()}
        {phase === 'input' && renderInput()}
        {phase === 'parsing' && renderLoading('Reading your measurements...')}
        {phase === 'confirm' && renderConfirm()}
        {phase === 'saving' && renderLoading('Saving...')}
      </ScrollView>

      {footerVisible && (
        <View style={styles.footer}>
          {isScanning ? (
            <View style={styles.savingRow}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.savingText}>Opening AR scanner...</Text>
            </View>
          ) : (
            <>
              {phase === 'confirm-count' && (
                <Button title="That's Right — Continue" onPress={() => confirmCountAndProceed(parseInt(countInput, 10) || 1)} />
              )}

              {phase === 'uncertain' && (
                <>
                  <Button title="Add More Photos" icon="camera" onPress={() => goToScreen('areaPhoto')} />
                  <Button title="I'll Tell You" icon="pencil" variant="outline" onPress={() => setPhase('manual-count')} />
                  <Button title="Skip for Now" onPress={handleSkip} variant="outline" />
                </>
              )}

              {phase === 'manual-count' && (
                <Button title="Continue" onPress={() => confirmCountAndProceed(parseInt(countInput, 10) || 1)} />
              )}

              {phase === 'intro' && (
                <>
                  {isARMeasurementAvailable() && <Button title="Scan with AR (Camera)" icon="scan" onPress={handleARScan} />}
                  <Button title={isARMeasurementAvailable() ? 'Type Measurements Instead' : 'Start Measuring'} onPress={() => setPhase('input')} variant={isARMeasurementAvailable() ? 'outline' : undefined} />
                  <Button title="Skip for Now" onPress={handleSkip} variant="outline" />
                </>
              )}

              {phase === 'input' && (
                <Button title="Continue" onPress={handleParse} disabled={!measurementText.trim()} />
              )}

              {phase === 'confirm' && (
                <>
                  <Button title="Save & Continue" onPress={() => saveAndContinue(parsedProfiles)} disabled={parsedProfiles.length === 0} />
                  <Button title="+ Add Another Size" variant="secondary" onPress={() => setPhase('input')} />
                  <Button title="Skip for Now" onPress={handleSkip} variant="outline" />
                </>
              )}
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function fieldLabelFor(key, relevantFields) {
  const match = relevantFields.find((f) => f.key === key);
  if (match) return match.label;
  const fallback = {
    length: 'Length', width: 'Width', height: 'Height',
    inner_length: 'Inside Length', inner_width: 'Inside Width', inner_height: 'Inside Height',
  };
  return fallback[key] || key;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scrollContent: { padding: 30, paddingBottom: 220 },
  centerBox: { alignItems: 'center', paddingVertical: 60 },
  loadingText: { marginTop: 16, fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
  header: { alignItems: 'center', marginBottom: 24 },
  emoji: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 28, fontFamily: Fonts.headingBold, color: Colors.accent, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  subtitleBold: { fontFamily: Fonts.bodySemiBold, color: Colors.accent },
  tipTextCenter: { fontSize: 13, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  areaBadge: { backgroundColor: Colors.secondary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  areaBadgeText: { fontSize: 15, fontFamily: Fonts.bodySemiBold, color: Colors.accent },
  arBox: { backgroundColor: Colors.cardBackground, borderRadius: 16, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: Colors.primary },
  arBoxTitle: { fontSize: 15, fontFamily: Fonts.bodySemiBold, color: Colors.accent },
  arBoxTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  arBoxTitleIcon: { marginRight: 6 },
  arBoxSubtitle: { fontSize: 13, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, lineHeight: 19 },
  infoBox: { backgroundColor: Colors.cardBackground, borderRadius: 16, padding: 20, marginBottom: 20 },
  infoTitle: { fontSize: 14, fontFamily: Fonts.bodySemiBold, color: Colors.accent, marginBottom: 12 },
  infoItem: { fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textPrimary, lineHeight: 26 },
  loadErrorText: { fontSize: 13, fontFamily: Fonts.bodyRegular, color: '#C0392B', marginBottom: 16, lineHeight: 19 },
  unitToggle: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  unitOption: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, alignItems: 'center' },
  unitOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.cardBackground },
  unitOptionText: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
  unitOptionTextActive: { fontFamily: Fonts.bodySemiBold, color: Colors.accent },
  exampleBox: { backgroundColor: Colors.cardBackground, borderRadius: 12, padding: 16, marginBottom: 20 },
  exampleTitle: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  exampleLine: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textPrimary, lineHeight: 21, marginBottom: 4 },
  exampleNote: { fontSize: 13, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, lineHeight: 19, marginTop: 6, fontStyle: 'italic' },
  fieldLabel: { fontSize: 22, fontFamily: Fonts.headingBold, color: Colors.accent, marginBottom: 8 },
  instruction: { fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textPrimary, lineHeight: 22, marginBottom: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  fieldChip: { backgroundColor: Colors.secondary, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  fieldChipText: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: Colors.accent },
  textArea: {
    backgroundColor: Colors.cardBackground, borderRadius: 12, padding: 16, fontSize: 16,
    fontFamily: Fonts.bodyRegular, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border,
    minHeight: 120, textAlignVertical: 'top', marginBottom: 20,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 10 },
  countButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  countButtonText: { fontSize: 24, fontFamily: Fonts.bodySemiBold, color: Colors.white },
  countInput: { width: 80, backgroundColor: Colors.cardBackground, borderRadius: 12, padding: 16, fontSize: 28, fontFamily: Fonts.bodySemiBold, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border },
  profileCard: { flexDirection: 'row', backgroundColor: Colors.cardBackground, borderRadius: 12, padding: 16, marginBottom: 12, alignItems: 'flex-start' },
  profileLine: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textPrimary, lineHeight: 21 },
  profileCount: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.primary, marginTop: 4 },
  profileRemove: { padding: 4 },
  profileRemoveText: { fontSize: 16, color: Colors.textSecondary },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border, gap: 10 },
  savingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 16 },
  savingText: { fontSize: 15, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
});
