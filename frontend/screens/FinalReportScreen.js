/**
 * Final Report Screen - Generate and download comprehensive report
 *
 * CHANGED (report redesign): the report used to render as one long markdown
 * dump in a single card — messy, wordy, and a lot of scrolling on a phone.
 * It's now split into per-section collapsible cards (parseReportSections),
 * led by a compact stat strip (rooms / areas / items), so the user sees a
 * scannable overview and taps into whatever section they actually want to
 * read. The AI-generated "Recommended Products" text section is filtered
 * out of the card view (still present in the raw report used for PDF/
 * share) since the ProductCard list below already covers it, and showing
 * both was pure duplication.
 *
 * CHANGED (PDF download broken): expo-file-system's top-level
 * `downloadAsync` was removed in SDK 54 — imports from the `/legacy` path,
 * which keeps the same signature this screen already uses.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, Alert, ActivityIndicator, Share, TextInput, TouchableOpacity } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import Markdown from 'react-native-markdown-display';
import Colors from '../constants/Colors';
import { apiFetch } from '../api';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import ProductCard from '../components/ProductCard';
import Icon from '../components/Icon';

const SECTION_ICONS = [
  { match: /step 1/i, icon: 'trash' },
  { match: /step 2/i, icon: 'box' },
  { match: /step 3/i, icon: 'home' },
  { match: /step 5|finish.*maintain/i, icon: 'sparkle' },
  { match: /donation/i, icon: 'bag' },
  { match: /keep going/i, icon: 'target' },
  { match: /after photos/i, icon: 'camera' },
  { match: /how did it go/i, icon: 'chat' },
  { match: /next space/i, icon: 'sparkle' },
  { match: /measurement/i, icon: 'ruler' },
];
const iconFor = (heading) => (SECTION_ICONS.find((s) => s.match.test(heading)) || {}).icon || 'check';
const EXPANDED_BY_DEFAULT = /step 1|step 2|step 3/i;

/**
 * Splits the AI-generated markdown report (a title line + "## Section"
 * blocks) into { title, sections: [{heading, body}] } so each section can
 * render as its own card instead of one continuous scroll.
 */
function parseReportSections(markdown) {
  if (!markdown) return { title: 'Your Home Organization Plan', sections: [] };
  const lines = markdown.split('\n');
  let title = 'Your Home Organization Plan';
  let startIndex = 0;
  if (lines[0] && lines[0].startsWith('# ')) {
    title = lines[0].replace(/^#\s*/, '').replace(/[🏠🎉]/g, '').trim() || title;
    startIndex = 1;
  }
  const rest = lines.slice(startIndex).join('\n');
  const parts = rest.split(/\n(?=##\s)/g).map((p) => p.trim()).filter(Boolean);
  const sections = parts.map((part) => {
    const [headingLine, ...bodyLines] = part.split('\n');
    return {
      heading: headingLine.replace(/^##\s*/, '').trim(),
      body: bodyLines.join('\n').trim(),
    };
  });
  return { title, sections };
}

function ReportSectionCard({ heading, body }) {
  const [expanded, setExpanded] = useState(EXPANDED_BY_DEFAULT.test(heading));
  return (
    <View style={styles.sectionCard}>
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <View style={styles.sectionHeaderRow}>
          <Icon name={iconFor(heading)} size={18} color={Colors.icon} style={styles.sectionHeaderIcon} />
          <Text style={styles.sectionHeaderText}>{heading}</Text>
        </View>
        <Text style={styles.sectionChevron}>{expanded ? '−' : '+'}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.sectionBody}>
          <Markdown style={markdownStyles}>{body}</Markdown>
        </View>
      )}
    </View>
  );
}

export default function FinalReportScreen({
  goToScreen,
  goBack,
  canGoBack,
  appData,
  apiBaseUrl,
  sessionId,
  authUser,
  resetAppData
}) {
  const [report, setReport] = useState(null);
  const [pdfFilename, setPdfFilename] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  // Pre-filled if the project was already named at the start of the flow
  // (ProjectNameScreen) — this field just lets them confirm/change it,
  // not necessarily type it from scratch a second time.
  const [projectName, setProjectName] = useState(appData.projectName || '');
  const [emailAddress, setEmailAddress] = useState(authUser?.email || '');
  const [isEmailing, setIsEmailing] = useState(false);
  // CHANGED (resume stat bug): the stat strip used to be computed purely
  // from client state (appData.selectedRooms / allRecommendations), which
  // a resumed session never fully restores — the report text itself was
  // always correct (server-generated), only this strip undercounted. Now
  // read from the server project directly, same source of truth as the
  // report.
  const [projectStats, setProjectStats] = useState(null);

  useEffect(() => {
    generateReport();
    loadProducts();
    loadProjectStats();
  }, []);

  const loadProjectStats = async () => {
    if (!sessionId) return;
    try {
      const response = await apiFetch(`${apiBaseUrl}/projects/${sessionId}`);
      const data = await response.json();
      if (response.ok && data.success && data.project) {
        const rooms = data.project.rooms || [];
        // "Start This Room Over" appends a fresh room entry rather than
        // editing the discarded one (see RoomSelectionScreen.js), so a
        // project can have multiple entries for the same room — keep only
        // the most recent per room and drop discarded attempts entirely,
        // otherwise an abandoned retry inflates these counts.
        const latestByKey = new Map();
        rooms.forEach((room) => {
          latestByKey.set(room.room_key || room.type, room);
        });
        const activeRooms = [...latestByKey.values()].filter((r) => r.status !== 'discarded');
        const areaCount = activeRooms.reduce((sum, room) => sum + (room.areas || []).length, 0);
        setProjectStats({ roomCount: activeRooms.length, areaCount });
      }
    } catch (error) {
      console.error('❌ Failed to load project stats:', error);
      // Non-fatal — falls back to client-side counts below.
    }
  };

  const generateReport = async () => {
    if (!sessionId) {
      Alert.alert('Error', 'Session not initialized. Please restart the app.');
      return;
    }

    setIsGenerating(true);

    try {
      const response = await apiFetch(`${apiBaseUrl}/report/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      setReport(data.report);
      setPdfFilename(data.pdf_filename);

    } catch (error) {
      console.error('❌ Report generation error:', error);
      Alert.alert(
        'Generation Error',
        `Failed to create report: ${error.message}\n\nPlease try again.`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const loadProducts = async () => {
    if (!sessionId) return;
    try {
      const response = await apiFetch(`${apiBaseUrl}/projects/${sessionId}/products`);
      const data = await response.json();
      if (response.ok && data.success) {
        setAllProducts(data.products || []);
      }
    } catch (error) {
      console.error('❌ Failed to load products:', error);
    }
  };

  const downloadPDF = async () => {
    if (!pdfFilename) {
      Alert.alert('Error', 'PDF file not available. Please regenerate the report.');
      return;
    }

    setIsDownloading(true);

    try {
      const downloadUrl = `${apiBaseUrl}/report/download/${pdfFilename}`;
      const fileUri = FileSystem.documentDirectory + pdfFilename;

      const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);

      if (downloadResult.status !== 200) {
        throw new Error('Failed to download PDF');
      }

      const isSharingAvailable = await Sharing.isAvailableAsync();

      if (isSharingAvailable) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save Your Home Organization Report',
          UTI: 'com.adobe.pdf'
        });
      } else {
        Alert.alert('Download Complete', `Report saved to: ${downloadResult.uri}`, [{ text: 'OK' }]);
      }

    } catch (error) {
      console.error('❌ Download error:', error);
      Alert.alert('Download Error', `Failed to download report: ${error.message}`, [{ text: 'OK' }]);
    } finally {
      setIsDownloading(false);
    }
  };

  const saveProject = async () => {
    if (!sessionId) {
      Alert.alert('Error', 'Session not initialized.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/projects/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: projectName.trim() || 'My Home Organization Plan',
          saved_at: new Date().toISOString(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save project');
      }

      Alert.alert(
        'Project Saved',
        'Your plan is saved — you can find it anytime under the Projects tab.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('❌ Save project error:', error);
      Alert.alert('Save Error', `Failed to save project: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const emailReport = async () => {
    if (!sessionId) {
      Alert.alert('Error', 'Session not initialized.');
      return;
    }
    if (!emailAddress.trim()) {
      Alert.alert('Missing Email', 'Enter an email address to send the report to.');
      return;
    }

    setIsEmailing(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/report/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, to_email: emailAddress.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send email');
      }
      Alert.alert('Sent', `Your report was emailed to ${emailAddress.trim()}.`);
    } catch (error) {
      console.error('❌ Email report error:', error);
      Alert.alert('Email Error', error.message);
    } finally {
      setIsEmailing(false);
    }
  };

  const sharePlan = async () => {
    if (!report) {
      Alert.alert('Not Ready', 'Your report is still being generated.');
      return;
    }
    try {
      await Share.share({ title: 'My Home Organization Plan', message: report });
    } catch (error) {
      console.error('❌ Share error:', error);
    }
  };

  const startOver = () => {
    Alert.alert(
      'Start Over?',
      'This will clear your current session and start fresh.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start Over', style: 'destructive', onPress: () => resetAppData() }
      ]
    );
  };

  if (isGenerating) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingTitle}>Creating Your Report</Text>
          <Text style={styles.loadingText}>
            AI is compiling all your recommendations into a comprehensive action plan...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon name="sad" size={48} color={Colors.icon} style={styles.errorEmoji} />
          <Text style={styles.errorTitle}>Report Not Available</Text>
          <Text style={styles.errorText}>Something went wrong while generating your report.</Text>
          <Button title="Try Again" onPress={generateReport} style={styles.retryButton} />
        </View>
      </SafeAreaView>
    );
  }

  const { title, sections } = parseReportSections(report);
  const cardSections = sections.filter((s) => !/recommended products|step 4:? add the right storage/i.test(s.heading));
  const roomCount = projectStats ? projectStats.roomCount : new Set((appData.selectedRooms || [])).size;
  const areaCount = projectStats ? projectStats.areaCount : (appData.allRecommendations || []).length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <BackButton onPress={goBack} visible={canGoBack} />

        <View style={styles.header}>
          <Icon name="party" size={48} color={Colors.icon} style={styles.emoji} />
          <Text style={styles.title}>{title}</Text>
        </View>

        <View style={styles.statStrip}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{roomCount}</Text>
            <Text style={styles.statLabel}>Room{roomCount === 1 ? '' : 's'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{areaCount}</Text>
            <Text style={styles.statLabel}>Area{areaCount === 1 ? '' : 's'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{allProducts.length}</Text>
            <Text style={styles.statLabel}>Item{allProducts.length === 1 ? '' : 's'}</Text>
          </View>
        </View>

        {cardSections.map((section, i) => (
          <ReportSectionCard key={i} heading={section.heading} body={section.body} />
        ))}

        {allProducts.length > 0 && (
          <View style={styles.productsSection}>
            <View style={styles.sectionTitleRow}>
              <Icon name="bag" size={18} color={Colors.accent} style={styles.sectionTitleIcon} />
              <Text style={styles.sectionTitle}>Shopping List</Text>
            </View>
            {allProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </View>
        )}

        <View style={styles.saveShareBox}>
          <Text style={styles.sectionTitle}>Save & Share</Text>
          <TextInput
            style={styles.nameInput}
            value={projectName}
            onChangeText={setProjectName}
            placeholder="Project name (optional)"
            placeholderTextColor={Colors.textLight}
          />
          <View style={styles.saveShareRow}>
            <Button
              title={isSaving ? 'Saving...' : 'Save'}
              onPress={saveProject}
              loading={isSaving}
              variant="secondary"
              style={styles.saveShareButtonHalf}
            />
            <Button title="Share" onPress={sharePlan} variant="outline" style={styles.saveShareButtonHalf} />
          </View>
        </View>

        <View style={styles.saveShareBox}>
          <View style={styles.sectionTitleRow}>
            <Icon name="mail" size={18} color={Colors.accent} style={styles.sectionTitleIcon} />
            <Text style={styles.sectionTitle}>Email Report</Text>
          </View>
          <TextInput
            style={styles.nameInput}
            value={emailAddress}
            onChangeText={setEmailAddress}
            placeholder="you@example.com"
            placeholderTextColor={Colors.textLight}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Button
            title={isEmailing ? 'Sending...' : 'Send PDF to This Email'}
            onPress={emailReport}
            loading={isEmailing}
            disabled={isEmailing}
            variant="secondary"
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isDownloading ? "Downloading..." : "Download PDF Report"}
          onPress={downloadPDF}
          loading={isDownloading}
          disabled={isDownloading}
        />
        <Button
          title="⬅ Organize Something Else"
          onPress={() => goToScreen('recommendations')}
          variant="outline"
          style={styles.startOverButton}
        />
        <Button title="Start Over" onPress={startOver} variant="outline" style={styles.startOverButton} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scrollContent: { padding: 24, paddingBottom: 220 },
  header: { alignItems: 'center', marginBottom: 16 },
  emoji: { fontSize: 56, marginBottom: 10 },
  title: {
    fontSize: 24,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    textAlign: 'center',
  },
  statStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 20,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: Colors.border },
  statNumber: { fontSize: 22, fontFamily: Fonts.headingBold, color: Colors.accent },
  statLabel: { fontSize: 12, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, marginTop: 2 },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.cardBackground,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sectionHeaderIcon: {
    marginRight: 10,
  },
  sectionHeaderText: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    flex: 1,
  },
  sectionChevron: {
    fontSize: 18,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    width: 20,
    textAlign: 'center',
  },
  sectionBody: {
    padding: 16,
    paddingTop: 12,
  },
  productsSection: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 17,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleIcon: {
    marginRight: 8,
    marginBottom: 0,
  },
  saveShareBox: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  nameInput: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  saveShareRow: { flexDirection: 'row', gap: 10 },
  saveShareButtonHalf: { flex: 1, marginTop: 0, minHeight: 44, paddingVertical: 10 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingTitle: { fontSize: 24, fontFamily: Fonts.headingBold, color: Colors.accent, marginTop: 20, marginBottom: 12 },
  loadingText: { fontSize: 16, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  errorEmoji: { fontSize: 80, marginBottom: 20 },
  errorTitle: { fontSize: 24, fontFamily: Fonts.headingBold, color: Colors.accent, marginBottom: 12 },
  errorText: { fontSize: 16, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', marginBottom: 30 },
  retryButton: { marginTop: 10 },
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
  startOverButton: { marginTop: 0 },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.bodyRegular,
  },
  heading3: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    marginTop: 10,
    marginBottom: 6,
  },
  paragraph: { marginBottom: 6, marginTop: 0 },
  strong: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
  },
  listItem: {
    marginBottom: 4,
    fontSize: 14,
    lineHeight: 19,
  },
  listUnorderedItemIcon: { color: Colors.primary },
  listOrderedItemIcon: { color: Colors.primary, fontFamily: Fonts.bodySemiBold },
});
