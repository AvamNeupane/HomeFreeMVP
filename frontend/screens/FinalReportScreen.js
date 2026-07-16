/**
 * Final Report Screen - Generate and download comprehensive report
 *
 * CHANGED (Task 8): shows the AccuracyBadge above the report so the user
 * sees, at a glance, how much measurement data fed into what they're about
 * to download.
 *
 * CHANGED (products + cart/save/share):
 *   - Fetches the whole-project matched product list from
 *     /projects/:id/products and shows it as a shopping list.
 *   - "Add All to Amazon Cart" opens each distinct affiliate storefront
 *     link that appears among the recommended products (per-product
 *     add-to-cart deep links need real ASINs — see products.py notes).
 *   - "Save Project" PATCHes the project with a saved timestamp/name and
 *     shows the user their project code so they can reference this session
 *     later.
 *   - "Share Plan" uses the native Share sheet to share the report text.
 * CHANGED (back navigation): added a Back button at the top of the screen.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, Alert, ActivityIndicator, Linking, Share, TextInput } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Markdown from 'react-native-markdown-display';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import AccuracyBadge from '../components/AccuracyBadge';
import ProductCard from '../components/ProductCard';

export default function FinalReportScreen({ 
  goToScreen,
  goBack,
  canGoBack,
  appData,
  apiBaseUrl,
  sessionId
}) {
  const [report, setReport] = useState(null);
  const [pdfFilename, setPdfFilename] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [projectName, setProjectName] = useState('');

  useEffect(() => {
    generateReport();
    loadProducts();
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

  const loadProducts = async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(`${apiBaseUrl}/projects/${sessionId}/products`);
      const data = await response.json();
      if (response.ok && data.success) {
        setAllProducts(data.products || []);
      }
    } catch (error) {
      console.error('❌ Failed to load products:', error);
      // Non-fatal — the report itself already lists products in text form.
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

  /**
   * Opens every distinct Amazon storefront link that appears among the
   * recommended products. Real per-item "Add to Cart" links need actual
   * ASINs (see products.py) — until then this is the closest equivalent:
   * one tap per storefront instead of hunting down each product manually.
   */
  const addAllToCart = async () => {
    if (allProducts.length === 0) {
      Alert.alert('No Products Yet', 'No products have been recommended yet in this session.');
      return;
    }

    const uniqueLinks = [...new Set(allProducts.map(p => p.amazon_link))];

    Alert.alert(
      'Add All to Amazon Cart',
      `This opens ${uniqueLinks.length} Amazon storefront link${uniqueLinks.length > 1 ? 's' : ''} covering all ${allProducts.length} recommended product${allProducts.length > 1 ? 's' : ''}. Add each to your cart from there.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Amazon',
          onPress: async () => {
            for (const link of uniqueLinks) {
              try {
                await Linking.openURL(link);
              } catch (error) {
                console.error('❌ Failed to open link:', link, error);
              }
            }
          }
        }
      ]
    );
  };

  const saveProject = async () => {
    if (!sessionId) {
      Alert.alert('Error', 'Session not initialized.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/projects/${sessionId}`, {
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
        `Your plan is saved. Project code:\n\n${sessionId}\n\nKeep this code to reference or resume this project later.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('❌ Save project error:', error);
      Alert.alert('Save Error', `Failed to save project: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sharePlan = async () => {
    if (!report) {
      Alert.alert('Not Ready', 'Your report is still being generated.');
      return;
    }
    try {
      await Share.share({
        title: 'My Home Organization Plan',
        message: report,
      });
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
        { 
          text: 'Start Over', 
          style: 'destructive',
          onPress: () => goToScreen('welcome', { resetHistory: true })
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
        <BackButton onPress={goBack} visible={canGoBack} />

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

        {allProducts.length > 0 && (
          <View style={styles.productsSection}>
            <Text style={styles.sectionTitle}>Your Full Shopping List</Text>
            {allProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
            <Button
              title="🛒 Add All to Amazon Cart"
              onPress={addAllToCart}
              style={styles.cartButton}
            />
          </View>
        )}

        <View style={styles.saveShareBox}>
          <Text style={styles.sectionTitle}>Save & Share</Text>
          <Text style={styles.inputLabel}>Project name (optional)</Text>
          <TextInput
            style={styles.nameInput}
            value={projectName}
            onChangeText={setProjectName}
            placeholder="e.g. Kitchen + Closet Refresh"
            placeholderTextColor={Colors.textLight}
          />
          <Button
            title={isSaving ? 'Saving...' : '💾 Save Project'}
            onPress={saveProject}
            loading={isSaving}
            variant="secondary"
            style={styles.saveShareButton}
          />
          <Button
            title="📤 Share Plan"
            onPress={sharePlan}
            variant="outline"
            style={styles.saveShareButton}
          />
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
          title="⬅ Organize Something Else"
          onPress={() => goToScreen('recommendations')}
          variant="outline"
          style={styles.startOverButton}
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
    paddingBottom: 220,
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
  productsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    marginBottom: 14,
  },
  cartButton: {
    marginTop: 6,
  },
  saveShareBox: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  saveShareButton: {
    marginTop: 8,
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