/**
 * Measure Your Space — guided measurement wizard for AI-detected areas.
 *
 * CHANGED (Task 8): shows the AccuracyBadge (Basic/Good/Excellent) so the
 * user can see how measuring this area affects their overall recommendation
 * quality. No other logic in this file changed.
 */

import React, { useState } from 'react';
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
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import ProgressBar from '../components/ProgressBar';
import AccuracyBadge from '../components/AccuracyBadge';
import {
  MEASUREMENT_FIELDS,
  MEASUREMENT_UNITS,
  getMeasureIntro,
  getShelfCountPrompt,
} from '../constants/MeasurementConfig';

const EMPTY_PROFILE = { width: '', depth: '', height: '', count: '1' };

export default function MeasureSpaceScreen({
  goToScreen,
  updateData,
  appData,
  apiBaseUrl,
  sessionId,
}) {
  const currentItem = appData.currentItem;
  const areaName = currentItem?.name || 'this space';

  const [unit, setUnit] = useState('in');
  const [phase, setPhase] = useState('intro');
  const [fieldIndex, setFieldIndex] = useState(0);
  const [currentProfile, setCurrentProfile] = useState({ ...EMPTY_PROFILE });
  const [shelfProfiles, setShelfProfiles] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const totalSteps = MEASUREMENT_FIELDS.length + 1;
  const currentStep =
    phase === 'measure'
      ? fieldIndex + 1
      : phase === 'count'
        ? MEASUREMENT_FIELDS.length + 1
        : 0;

  const updateProfile = (key, value) => {
    setCurrentProfile((prev) => ({ ...prev, [key]: value }));
  };

  const parseValue = (val) => {
    const num = parseFloat(val);
    return Number.isFinite(num) && num > 0 ? num : null;
  };

  const validateCurrentField = () => {
    if (fieldIndex < MEASUREMENT_FIELDS.length) {
      const key = MEASUREMENT_FIELDS[fieldIndex].key;
      if (!parseValue(currentProfile[key])) {
        Alert.alert('Required', 'Please enter a valid measurement greater than 0.');
        return false;
      }
    } else {
      const count = parseInt(currentProfile.count, 10);
      if (!count || count < 1) {
        Alert.alert('Required', 'Please enter how many shelves are this same size (at least 1).');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentField()) return;

    if (fieldIndex < MEASUREMENT_FIELDS.length - 1) {
      setFieldIndex(fieldIndex + 1);
    } else if (fieldIndex === MEASUREMENT_FIELDS.length - 1) {
      setPhase('count');
    }
  };

  const handleAddProfile = () => {
    if (!validateCurrentField()) return;

    const profile = {
      width: parseValue(currentProfile.width),
      depth: parseValue(currentProfile.depth),
      height: parseValue(currentProfile.height),
      count: parseInt(currentProfile.count, 10),
    };

    setShelfProfiles((prev) => [...prev, profile]);
    setCurrentProfile({ ...EMPTY_PROFILE });
    setFieldIndex(0);
    setPhase('measure');
  };

  const saveAndContinue = async (profiles, skipped = false) => {
    const measurementData = {
      areaName,
      roomType: appData.currentRoom,
      unit,
      shelfProfiles: profiles,
      skipped,
    };

    const existing = appData.areaMeasurements || {};
    const updatedMeasurements = {
      ...existing,
      [areaName]: measurementData,
    };

    updateData({ areaMeasurements: updatedMeasurements });

    if (sessionId) {
      setIsSaving(true);
      try {
        const response = await fetch(`${apiBaseUrl}/area/measurements`, {
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
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to save measurements');
        }
      } catch (error) {
        console.error('Measurement save error:', error);
        Alert.alert(
          'Save Warning',
          'Measurements saved locally but could not sync to server. They will still appear in your summary.',
          [{ text: 'Continue', onPress: () => goToScreen('areaPhoto') }]
        );
        setIsSaving(false);
        return;
      } finally {
        setIsSaving(false);
      }
    }

    goToScreen('areaPhoto');
  };

  const handleFinishProfiles = () => {
    if (!validateCurrentField()) return;

    const finalProfile = {
      width: parseValue(currentProfile.width),
      depth: parseValue(currentProfile.depth),
      height: parseValue(currentProfile.height),
      count: parseInt(currentProfile.count, 10),
    };

    saveAndContinue([...shelfProfiles, finalProfile]);
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Measurements?',
      'Without measurements, product recommendations in your final report will be less precise. You can always measure later.',
      [
        { text: 'Go Back', style: 'cancel' },
        {
          text: 'Skip Anyway',
          style: 'destructive',
          onPress: () => saveAndContinue([], true),
        },
      ]
    );
  };

  const unitSymbol = MEASUREMENT_UNITS[unit].symbol;

  const renderUnitToggle = () => (
    <View style={styles.unitToggle}>
      {Object.entries(MEASUREMENT_UNITS).map(([key, { label }]) => (
        <TouchableOpacity
          key={key}
          style={[styles.unitOption, unit === key && styles.unitOptionActive]}
          onPress={() => setUnit(key)}
        >
          <Text style={[styles.unitOptionText, unit === key && styles.unitOptionTextActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderIntro = () => (
    <>
      <View style={styles.header}>
        <Text style={styles.emoji}>📏</Text>
        <Text style={styles.title}>Measure Your Space</Text>
        <Text style={styles.subtitle}>{getMeasureIntro(areaName)}</Text>
        <View style={styles.areaBadge}>
          <Text style={styles.areaBadgeText}>{areaName}</Text>
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>You'll measure:</Text>
        {MEASUREMENT_FIELDS.map((field) => (
          <Text key={field.key} style={styles.infoItem}>
            • {field.label}
          </Text>
        ))}
        <Text style={styles.infoItem}>• How many shelves share this size</Text>
      </View>

      {renderUnitToggle()}

      <Text style={styles.tipText}>
        Tip: Measure one shelf, then tell us how many match — you won't need to measure every shelf.
      </Text>
    </>
  );

  const renderMeasureField = () => {
    const field = MEASUREMENT_FIELDS[fieldIndex];
    return (
      <>
        <ProgressBar
          current={currentStep}
          total={totalSteps}
          label={`Measurement ${currentStep} of ${totalSteps}`}
        />

        <Text style={styles.fieldLabel}>{field.label}</Text>
        <Text style={styles.instruction}>{field.instruction}</Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.measureInput}
            value={currentProfile[field.key]}
            onChangeText={(v) => updateProfile(field.key, v)}
            placeholder={field.placeholder}
            placeholderTextColor={Colors.textLight}
            keyboardType="decimal-pad"
            autoFocus
          />
          <Text style={styles.unitLabel}>{unitSymbol}</Text>
        </View>
      </>
    );
  };

  const renderCountStep = () => (
    <>
      <ProgressBar
        current={currentStep}
        total={totalSteps}
        label={`Measurement ${currentStep} of ${totalSteps}`}
      />

      <Text style={styles.fieldLabel}>Shelf Count</Text>
      <Text style={styles.instruction}>{getShelfCountPrompt(areaName)}</Text>

      <View style={styles.countRow}>
        <TouchableOpacity
          style={styles.countButton}
          onPress={() => {
            const n = Math.max(1, parseInt(currentProfile.count, 10) - 1 || 0);
            updateProfile('count', String(n));
          }}
        >
          <Text style={styles.countButtonText}>−</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.countInput}
          value={currentProfile.count}
          onChangeText={(v) => updateProfile('count', v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          textAlign="center"
        />
        <TouchableOpacity
          style={styles.countButton}
          onPress={() => {
            const n = (parseInt(currentProfile.count, 10) || 0) + 1;
            updateProfile('count', String(n));
          }}
        >
          <Text style={styles.countButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {shelfProfiles.length > 0 && (
        <View style={styles.savedProfiles}>
          <Text style={styles.savedTitle}>
            Saved sizes ({shelfProfiles.length})
          </Text>
          {shelfProfiles.map((p, i) => (
            <Text key={i} style={styles.savedItem}>
              Size {i + 1}: {p.width} × {p.depth} × {p.height} {unitSymbol} × {p.count} shelves
            </Text>
          ))}
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AccuracyBadge appData={appData} />

        {phase === 'intro' && renderIntro()}
        {phase === 'measure' && renderMeasureField()}
        {phase === 'count' && renderCountStep()}
      </ScrollView>

      <View style={styles.footer}>
        {isSaving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.savingText}>Saving measurements...</Text>
          </View>
        ) : (
          <>
            {phase === 'intro' && (
              <>
                <Button title="Start Measuring" onPress={() => setPhase('measure')} />
                <Button title="Skip for Now" onPress={handleSkip} variant="outline" />
              </>
            )}

            {phase === 'measure' && (
              <>
                <Button
                  title="Next"
                  onPress={handleNext}
                  disabled={!parseValue(currentProfile[MEASUREMENT_FIELDS[fieldIndex].key])}
                />
                {fieldIndex > 0 && (
                  <Button
                    title="Back"
                    variant="outline"
                    onPress={() => setFieldIndex(fieldIndex - 1)}
                  />
                )}
              </>
            )}

            {phase === 'count' && (
              <>
                <Button title="Continue" onPress={handleFinishProfiles} />
                <Button
                  title="Add a Different Shelf Size"
                  variant="secondary"
                  onPress={handleAddProfile}
                />
                <Button title="Skip for Now" onPress={handleSkip} variant="outline" />
              </>
            )}
          </>
        )}
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
    paddingBottom: 200,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  areaBadge: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  areaBadgeText: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
  },
  infoBox: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    marginBottom: 12,
  },
  infoItem: {
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    lineHeight: 26,
  },
  unitToggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  unitOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  unitOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.cardBackground,
  },
  unitOptionText: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
  unitOptionTextActive: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
  },
  tipText: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  fieldLabel: {
    fontSize: 22,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 12,
  },
  instruction: {
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    lineHeight: 24,
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  measureInput: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitLabel: {
    fontSize: 20,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
    minWidth: 36,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  countButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countButtonText: {
    fontSize: 24,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.white,
  },
  countInput: {
    width: 80,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  savedProfiles: {
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  savedTitle: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  savedItem: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.accent,
    lineHeight: 22,
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
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  savingText: {
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
});