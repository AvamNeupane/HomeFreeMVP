/**
 * Final Report Screen - Generate and download comprehensive report
 *
 * CHANGED (Task 8): shows the AccuracyBadge above the report so the user
 * sees, at a glance, how much measurement data fed into what they're about
 * to download. No other logic in this file changed.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Markdown from 'react-native-markdown-display';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import AccuracyBadge from '../components/AccuracyBadge';

export default function FinalReportScreen({ 
  goToScreen,
  appData,
  apiBaseUrl,
  sessionId
}) {
  const [report, setReport] = useState(null);
  const [pdfFilename, setPdfFilename] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    generateReport();
  }, []);

  const generateReport = async () => {
    if (!sessionId) {
      Alert.alert('Error', 'Session not initialized. Please restart the app.');
      return;
    }

    setIsGenerating(true);

    try {
      console.log('📝 Generating final report...');

      const response = await fetch(`${apiBaseUrl}/report/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate report');
      }

      console.log('✅ Report generated successfully');
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

  const downloadPDF = async () => {
    if (!pdfFilename) {
      Alert.alert('Error', 'PDF file not available. Please regenerate the report.');
      return;
    }

    setIsDownloading(true);

    try {
      console.log('📥 Downloading PDF:', pdfFilename);

      // Download PDF from backend
      const downloadUrl = `${apiBaseUrl}/report/download/${pdfFilename}`;
      const fileUri = FileSystem.documentDirectory + pdfFilename;

      const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);

      if (downloadResult.status !== 200) {
        throw new Error('Failed to download PDF');
      }

      console.log('✅ PDF downloaded:', downloadResult.uri);

      // Check if sharing is available
      const isSharingAvailable = await Sharing.isAvailableAsync();
      
      if (isSharingAvailable) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save Your Home Organization Report',
          UTI: 'com.adobe.pdf'
        });
      } else {
        Alert.alert(
          'Download Complete',
          `Report saved to: ${downloadResult.uri}`,
          [{ text: 'OK' }]
        );
      }

    } catch (error) {
      console.error('❌ Download error:', error);
      Alert.alert(
        'Download Error',
        `Failed to download report: ${error.message}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const startOver = () => {
    Alert.alert(
      'Start Over?',
      'This will clear your current session and start fresh.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start Over', 
          style: 'destructive',
          onPress: () => goToScreen('welcome')
        }
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
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorTitle}>Report Not Available</Text>
          <Text style={styles.errorText}>
            Something went wrong while generating your report.
          </Text>
          <Button 
            title="Try Again"
            onPress={generateReport}
            style={styles.retryButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Your Home Organization Plan</Text>
          <Text style={styles.subtitle}>
            A complete guide to transform your space
          </Text>
        </View>

        <AccuracyBadge appData={appData} />

        <View style={styles.reportContainer}>
          <Markdown style={markdownStyles}>
            {report}
          </Markdown>
        </View>

        <View style={styles.successBox}>
          <Text style={styles.successText}>
            ✅ Your personalized plan is ready!
          </Text>
          <Text style={styles.successSubtext}>
            Download the PDF to access it anytime
          </Text>
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
          title="Start Over"
          onPress={startOver}
          variant="outline"
          style={styles.startOverButton}
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
    paddingBottom: 180,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
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
  },
  reportContainer: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  successBox: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  successText: {
    fontSize: 18,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.white,
    marginBottom: 8,
  },
  successSubtext: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.white,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingTitle: {
    fontSize: 24,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginTop: 20,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 30,
  },
  retryButton: {
    marginTop: 10,
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
  startOverButton: {
    marginTop: 0,
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: Fonts.bodyRegular,
  },
  heading1: {
    fontSize: 22,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginTop: 16,
    marginBottom: 10,
  },
  heading2: {
    fontSize: 18,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    marginTop: 14,
    marginBottom: 8,
  },
  heading3: {
    fontSize: 16,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    marginTop: 10,
    marginBottom: 6,
  },
  paragraph: {
    marginBottom: 8,
  },
  strong: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
  },
  listItem: {
    marginBottom: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  listUnorderedItemIcon: {
    color: Colors.primary,
  },
  listOrderedItemIcon: {
    color: Colors.primary,
    fontFamily: Fonts.bodySemiBold,
  },
});