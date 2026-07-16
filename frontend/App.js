/**
 * Home Organization App - Main Entry Point
 * Enhanced with robust error handling and network diagnostics
 * FIXED: Proper environment variable reading for ngrok support
 *
 * CHANGED (Task 7): initial screen is now 'consent', not 'welcome'.
 * CHANGED (Task 5): registered the new PrioritiesScreen.
 * CHANGED (Task 4/5/7): new appData fields — consentGiven, selectedItems,
 * organizationPriorities, visualStyle.
 * CHANGED (Back navigation): goToScreen now pushes onto a history stack, and
 * a new goBack()/canGoBack pair is included in sharedProps so every screen
 * can offer a working "Back" button without each screen managing its own
 * history. Screens that need to skip history (e.g. after a destructive
 * "Start Over") can call goToScreen(screen, { resetHistory: true }).
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, StatusBar, Alert, Platform } from 'react-native';
import { useFonts, LibreBaskerville_400Regular, LibreBaskerville_700Bold } from '@expo-google-fonts/libre-baskerville';
import { Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import * as SplashScreen from 'expo-splash-screen';
import axios from 'axios';
import Constants from 'expo-constants';

// Import screens
import ConsentScreen from './screens/ConsentScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import RoomSelectionScreen from './screens/RoomSelectionScreen';
import PhotoGuidanceScreen from './screens/PhotoGuidanceScreen';
import ItemSelectionScreen from './screens/ItemSelectionScreen';
import AreaPhotoScreen from './screens/AreaPhotoScreen';
import PrioritiesScreen from './screens/PrioritiesScreen';
import IntentionQuestionScreen from './screens/IntentionQuestionScreen';
import RecommendationsScreen from './screens/RecommendationsScreen';
import FinalReportScreen from './screens/FinalReportScreen';
import MeasureSpaceScreen from './screens/MeasureSpaceScreen';

// API Configuration with fallback
const getApiBaseUrl = () => {
  // FIXED: Actually read the environment variable using process.env
const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  
  if (envUrl && envUrl !== 'undefined') {
    console.log('📡 Using API_BASE_URL from .env:', envUrl);
    return envUrl;
  }
  console.log('📡 API_BASE_URL:', process.env.EXPO_PUBLIC_API_BASE_URL);
  // Fallback to localhost
  const defaultUrl = 'http://localhost:5001';
  console.log('⚠️  API_BASE_URL not found in .env, using default:', defaultUrl);
  return defaultUrl;
};

const API_BASE_URL = getApiBaseUrl();

// Keep splash screen visible while loading fonts
SplashScreen.preventAutoHideAsync();

// Configure axios defaults
axios.defaults.timeout = 30000; // 30 second timeout
axios.defaults.headers.common['Content-Type'] = 'application/json';
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true'; // ← ADD THIS LINE


export default function App() {
  // Load custom fonts
  let [fontsLoaded, fontsError] = useFonts({
    LibreBaskerville_400Regular,
    LibreBaskerville_700Bold,
    Montserrat_400Regular,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  // App state
  // CHANGED (Task 7): start on the consent screen, not welcome.
  const [currentScreen, setCurrentScreen] = useState('consent');
  // Back-navigation history: every screen we've visited, in order, so
  // goBack() can pop off the most recent one. The very first screen never
  // gets a working Back button since there's nothing behind it.
  const [screenHistory, setScreenHistory] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('checking'); // checking, connected, error
  const [appData, setAppData] = useState({
    consentGiven: false,
    selectedRooms: [],
    currentRoomIndex: 0,
    currentRoom: null,
    roomPhotos: [],
    detectedItems: [],
    selectedItems: [],
    currentItemIndex: 0,
    currentItem: null,
    areaPhotos: [],
    currentQuestion: null,
    currentContext: null,
    organizationPriorities: [],
    visualStyle: null,
    currentRecommendation: null,
    allRecommendations: [],
    areaMeasurements: {}
  });

  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontsError]);

  // Test backend connection and create session on app start
  useEffect(() => {
    testConnection();
  }, []);

  /**
   * Test backend connection with detailed diagnostics
   */
  const testConnection = async () => {
    try {
      console.log('🔍 Testing backend connection...');
      console.log('📡 API Base URL:', API_BASE_URL);
      console.log('📱 Platform:', Platform.OS);
      console.log('🌐 Device Name:', Constants.deviceName);
      
      setConnectionStatus('checking');
      
      // First, try health check
      try {
        const healthResponse = await axios.get(`${API_BASE_URL}/health`, {
          timeout: 10000
        });
        
        console.log('✅ Health check successful:', healthResponse.data);
        console.log('📊 Server IP:', healthResponse.data.server_ip);
        console.log('🔐 Allowed origins:', healthResponse.data.allowed_origins);
        
        // Now create session
        await createSession();
        
      } catch (healthError) {
        console.error('❌ Health check failed:', healthError.message);
        
        // Try to provide helpful error message
        let errorMessage = 'Cannot connect to backend server.\n\n';
        
        if (healthError.code === 'ECONNREFUSED') {
          errorMessage += '⚠️  Connection Refused:\n';
          errorMessage += '- Make sure Flask backend is running\n';
          errorMessage += `- Check that it's accessible at ${API_BASE_URL}\n`;
          errorMessage += '- If using ngrok, make sure the tunnel is active\n\n';
        } else if (healthError.code === 'ECONNABORTED' || healthError.code === 'ETIMEDOUT') {
          errorMessage += '⏱️  Connection Timeout:\n';
          errorMessage += '- Server might be slow or unreachable\n';
          errorMessage += '- Check your network connection\n';
          errorMessage += '- Verify ngrok tunnel is active\n\n';
        } else if (healthError.message.includes('Network Error')) {
          errorMessage += '🌐 Network Error:\n';
          errorMessage += `- Current URL: ${API_BASE_URL}\n`;
          errorMessage += '- For ngrok: Check the tunnel URL is correct\n';
          errorMessage += '- For localhost: Make sure backend is running\n';
          errorMessage += '- Check your internet connection\n\n';
        }
        
        errorMessage += `Technical Details:\n${healthError.message}`;
        
        setConnectionStatus('error');
        
        Alert.alert(
          'Connection Error',
          errorMessage,
          [
            { text: 'Retry', onPress: testConnection },
            { text: 'Continue Anyway', onPress: () => setConnectionStatus('connected'), style: 'cancel' }
          ]
        );
      }
      
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      setConnectionStatus('error');
      
      Alert.alert(
        'Unexpected Error',
        `Failed to test connection: ${error.message}`,
        [
          { text: 'Retry', onPress: testConnection },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  };

  /**
   * Create a new session with the backend
   */
  const createSession = async () => {
    try {
      console.log('🔄 Creating session...');
      
      const response = await axios.post(`${API_BASE_URL}/session/create`, {}, {
        timeout: 10000
      });
      
      if (response.data && response.data.success) {
        setSessionId(response.data.session_id);
        setConnectionStatus('connected');
        console.log('✅ Session created:', response.data.session_id);
      } else {
        throw new Error('Invalid response from server');
      }
      
    } catch (error) {
      console.error('❌ Session creation failed:', error);
      
      let errorMessage = 'Failed to create session.\n\n';
      
      if (error.response) {
        // Server responded with error
        errorMessage += `Server Error (${error.response.status}):\n`;
        errorMessage += error.response.data?.error || error.response.statusText;
      } else if (error.request) {
        // No response received
        errorMessage += 'No response from server.\n';
        errorMessage += `Make sure backend is running at:\n${API_BASE_URL}`;
      } else {
        // Request setup error
        errorMessage += error.message;
      }
      
      setConnectionStatus('error');
      
      Alert.alert(
        'Session Error',
        errorMessage,
        [
          { text: 'Retry', onPress: createSession },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  };

  // Handle font loading errors
  if (fontsError) {
    console.error('❌ Font loading error:', fontsError);
    Alert.alert('Error', 'Failed to load fonts. Please restart the app.');
    return null;
  }

  // Wait for fonts to load
  if (!fontsLoaded) {
    return null;
  }

  // Screen navigation functions
  const updateData = (newData) => {
    console.log('📝 Updating app data:', Object.keys(newData));
    setAppData(prev => ({ ...prev, ...newData }));
  };

  /**
   * Navigate forward to a screen, remembering where we came from.
   * @param {string} screen - screen key to navigate to
   * @param {{resetHistory?: boolean}} [opts] - pass resetHistory: true to
   *        clear the back-stack (e.g. "Start Over").
   */
  const goToScreen = (screen, opts = {}) => {
    console.log('🔄 Navigating to:', screen);
    if (opts.resetHistory) {
      setScreenHistory([]);
    } else {
      setScreenHistory(prev => [...prev, currentScreen]);
    }
    setCurrentScreen(screen);
  };

  /**
   * Go back to whatever screen preceded the current one. No-op if there's
   * no history (e.g. already on the very first screen).
   */
  const goBack = () => {
    setScreenHistory(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const previousScreen = next.pop();
      console.log('↩️  Going back to:', previousScreen);
      setCurrentScreen(previousScreen);
      return next;
    });
  };

  const canGoBack = screenHistory.length > 0;

  // Render current screen
  const renderScreen = () => {
    const sharedProps = {
      apiBaseUrl: API_BASE_URL,
      sessionId,
      appData,
      updateData,
      goToScreen,
      goBack,
      canGoBack,
      connectionStatus
    };

    switch (currentScreen) {
      case 'consent':
        return <ConsentScreen {...sharedProps} />;
      case 'welcome':
        return <WelcomeScreen {...sharedProps} />;
      case 'roomSelection':
        return <RoomSelectionScreen {...sharedProps} />;
      case 'photoGuidance':
        return <PhotoGuidanceScreen {...sharedProps} />;
      case 'measureSpace':
        return <MeasureSpaceScreen {...sharedProps} />;
      case 'itemSelection':
        return <ItemSelectionScreen {...sharedProps} />;
      case 'areaPhoto':
        return <AreaPhotoScreen {...sharedProps} />;
      case 'priorities':
        return <PrioritiesScreen {...sharedProps} />;
      case 'intentionQuestion':
        return <IntentionQuestionScreen {...sharedProps} />;
      case 'recommendations':
        return <RecommendationsScreen {...sharedProps} />;
      case 'finalReport':
        return <FinalReportScreen {...sharedProps} />;
      default:
        console.warn('⚠️  Unknown screen:', currentScreen);
        return <ConsentScreen {...sharedProps} />;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {renderScreen()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});