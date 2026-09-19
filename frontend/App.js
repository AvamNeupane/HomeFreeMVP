/**
 * Home Organization App - Main Entry Point
 * Runs fully locally against your Flask backend on the same WiFi network —
 * no ngrok, no tunnel, no third-party relay.
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
 * CHANGED (ngrok removed): this app previously assumed you might be
 * tunneling the backend through ngrok (the 'ngrok-skip-browser-warning'
 * header, ngrok-specific error copy). All of that is gone — this is now a
 * plain local client/server setup: run `python app.py` in backend/, point
 * EXPO_PUBLIC_API_BASE_URL at your computer's LAN IP, done.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, StatusBar, Alert, Platform, ActivityIndicator, TouchableOpacity, Text, SafeAreaView } from 'react-native';
import { useFonts, LibreBaskerville_400Regular, LibreBaskerville_700Bold } from '@expo-google-fonts/libre-baskerville';
import { Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import * as SplashScreen from 'expo-splash-screen';
import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setApiAuthToken, fetchRoomStatuses, fetchProjectDetail, computeRoomResumeTarget } from './api';
import Icon from './components/Icon';
import Colors from './constants/Colors';
import { ROOM_TYPES } from './constants/RoomConfig';

// Import screens
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import LiabilityScreen from './screens/LiabilityScreen';
import ConsentScreen from './screens/ConsentScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import RoomSelectionScreen from './screens/RoomSelectionScreen';
import PhotoGuidanceScreen from './screens/PhotoGuidanceScreen';
import ItemSelectionScreen from './screens/ItemSelectionScreen';
import AreaPhotoScreen from './screens/AreaPhotoScreen';
import PrioritiesScreen from './screens/PrioritiesScreen';
import IntentionQuestionScreen from './screens/IntentionQuestionScreen';
import DirectionPhotosScreen from './screens/DirectionPhotosScreen';
import ProjectsScreen from './screens/ProjectsScreen';
import SidebarMenu from './components/SidebarMenu';
import RecommendationsScreen from './screens/RecommendationsScreen';
import FinalReportScreen from './screens/FinalReportScreen';
import MeasureSpaceScreen from './screens/MeasureSpaceScreen';

const AUTH_TOKEN_KEY = 'homeFreeAuthToken';

// API Configuration with fallback
const getApiBaseUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  if (envUrl && envUrl !== 'undefined') {
    console.log('📡 Using API_BASE_URL from .env:', envUrl);
    return envUrl;
  }

  console.log('⚠️  EXPO_PUBLIC_API_BASE_URL not set in .env — falling back to localhost.');
  console.log('    If you are testing on a physical phone, localhost will NOT work.');
  console.log('    Set EXPO_PUBLIC_API_BASE_URL=http://<your-computer-LAN-IP>:5001 in frontend/.env instead.');
  const defaultUrl = 'http://localhost:5001';
  return defaultUrl;
};

const API_BASE_URL = getApiBaseUrl();

// Keep splash screen visible while loading fonts
SplashScreen.preventAutoHideAsync();

// Configure axios defaults. Generous timeout because Gemini calls
// (item detection / recommendations / final report) can legitimately take
// 15-25s — a short timeout here would abort a request that was actually
// still succeeding on the backend.
axios.defaults.timeout = 30000; // 30 seconds
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Health check gets its own shorter timeout since it should be near-instant
// on a healthy local server — if this one fails, the problem is
// connectivity/CORS/the server not running, not a slow AI call.
const HEALTH_CHECK_TIMEOUT = 8000; // 8 seconds
const SESSION_CREATE_TIMEOUT = 10000; // 10 seconds


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
  // CHANGED (auth): app now starts on an auth-check screen — if a stored
  // login token is found and still valid, the user skips straight past
  // login into the normal flow (and any in-progress project is offered
  // for resume); otherwise they land on the login screen.
  const [currentScreen, setCurrentScreen] = useState('authLoading');
  // Back-navigation history: every screen we've visited, in order, so
  // goBack() can pop off the most recent one. The very first screen never
  // gets a working Back button since there's nothing behind it.
  const [screenHistory, setScreenHistory] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  // Only two tabs, by design: the active in-progress flow ("home") and the
  // list of past/current projects ("projects"). No other persistent nav.
  const [activeTab, setActiveTab] = useState('home');
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('checking'); // checking, connected, error
  // { token, user, isNewSignup } captured right before routing to the
  // one-time LiabilityScreen — needed so accepting can resume exactly the
  // auth flow that was interrupted (see initializeAfterAuth).
  const [pendingAuthContext, setPendingAuthContext] = useState(null);

  // Default shape lives in its own constant (not just the useState call) so
  // resetAppData() below can return to exactly this, instead of the two
  // definitions silently drifting apart over time.
  const initialAppData = {
    consentGiven: false,
    selectedRooms: [],
    // { [roomType]: 'in_progress' | 'completed' | 'discarded' }. Populated
    // from the backend's per-room status (see /room/detect-items and
    // updateRoomStatus in api.js) — this is what lets Room Selection tell
    // "started but not finished, resumable" apart from "actually done,
    // locked", instead of both looking identical the moment a room is
    // picked.
    roomStatuses: {},
    currentRoomIndex: 0,
    currentRoom: null,
    // Human-readable name for currentRoom, sent to the backend instead of
    // the raw key (which for a custom room is a slugified id like
    // "custom_craft_room_a1b2" — not something that should ever end up in
    // an AI prompt). See RoomSelectionScreen's roomNameFor().
    currentRoomLabel: null,
    // { [roomKey]: {name, icon, photoGuidance} } for rooms created via
    // "Create Your Own Room" — keeps them out of the static ROOM_TYPES
    // config while still giving every screen that reads
    // ROOM_TYPES[currentRoom] something to fall back to.
    customRoomConfigs: {},
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
    areaMeasurements: {},
    chatIntention: null,
    chatPathLabel: null,
    followUpPhotoGuidance: []
  };
  const [appData, setAppData] = useState(initialAppData);

  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontsError]);

  // On launch: check for a stored login token before doing anything else.
  useEffect(() => {
    checkStoredAuth();
  }, []);

  /**
   * Look for a previously stored login token (AsyncStorage). If it's still
   * valid (GET /auth/me succeeds), skip straight past login and continue
   * into the normal flow — this is what makes the app resumable after
   * being closed, instead of forcing a fresh login every launch.
   */
  const checkStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!storedToken) {
        setCurrentScreen('login');
        return;
      }

      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      setApiAuthToken(storedToken); // keep apiFetch() (used by every screen) in sync
      const response = await axios.get(`${API_BASE_URL}/auth/me`, { timeout: HEALTH_CHECK_TIMEOUT });

      if (response.data && response.data.success) {
        setAuthToken(storedToken);
        setAuthUser(response.data.user);
        await initializeAfterAuth(storedToken, response.data.user);
      } else {
        throw new Error('Invalid session');
      }
    } catch (error) {
      // Only clear the stored token on an actual auth rejection (401) —
      // a network/timeout error just means the backend wasn't reachable
      // yet, and shouldn't force the user to log in again.
      const isAuthRejection = error.response && error.response.status === 401;
      console.log(
        isAuthRejection ? 'ℹ️  Stored token rejected, showing login screen' : 'ℹ️  Could not verify stored login (network) — showing login screen',
        error.message
      );
      if (isAuthRejection) {
        await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
        delete axios.defaults.headers.common['Authorization'];
        setApiAuthToken(null);
      }
      setCurrentScreen('login');
    }
  };

  /**
   * Called by LoginScreen/SignupScreen once the backend confirms the
   * email/password (or new account). Persists the token so the app stays
   * logged in across restarts, then proceeds into the normal flow.
   */
  const handleAuthenticated = async (token, user, isNewSignup = false) => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setApiAuthToken(token);
    setAuthToken(token);
    setAuthUser(user);
    await initializeAfterAuth(token, user, isNewSignup);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    delete axios.defaults.headers.common['Authorization'];
    setApiAuthToken(null);
    setAuthToken(null);
    setAuthUser(null);
    setSessionId(null);
    setScreenHistory([]);
    setCurrentScreen('login');
  };

  /**
   * After a successful login/signup (or a valid stored token on launch):
   * verify the backend is reachable, then check for an in-progress project
   * to resume before starting a brand new one. Resuming restores which
   * rooms are already organized (so RoomSelectionScreen greys them out
   * correctly) and reuses the same project id server-side — it does not
   * replay exact mid-step state like an in-progress photo upload; see
   * OVERVIEW.md for that scope boundary.
   */
  const initializeAfterAuth = async (token, user, isNewSignup = false) => {
    // CHANGED (liability disclaimer): a one-time-per-ACCOUNT acceptance
    // (recorded server-side, unlike the existing Consent screen which is
    // shown fresh every session) — gates everything else until accepted.
    // LiabilityScreen calls this same function again after recording
    // acceptance, with the now-updated user object, to continue exactly
    // where this would otherwise have gone.
    if (user && user.liability_accepted === false) {
      setPendingAuthContext({ token, user, isNewSignup });
      goToScreen('liability', { resetHistory: true });
      return;
    }

    setConnectionStatus('checking');
    try {
      await axios.get(`${API_BASE_URL}/health`, { timeout: HEALTH_CHECK_TIMEOUT });
    } catch (healthError) {
      setConnectionStatus('error');
      Alert.alert(
        'Connection Error',
        `Cannot reach the backend at ${API_BASE_URL}.\n\nMake sure it's running locally (cd backend && python app.py) and this device is on the same WiFi network.\n\n${healthError.message}`,
        [
          { text: 'Retry', onPress: () => initializeAfterAuth(token, user, isNewSignup) },
          { text: 'Continue Anyway', style: 'cancel', onPress: () => startFreshSession(token, isNewSignup) },
        ]
      );
      return;
    }

    try {
      const res = await axios.get(`${API_BASE_URL}/projects`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: SESSION_CREATE_TIMEOUT,
      });
      const projects = (res.data && res.data.projects) || [];
      const incomplete = projects.find((p) => !p.has_report);

      if (incomplete) {
        Alert.alert(
          'Continue Your Project?',
          `You have an in-progress plan${incomplete.rooms.length ? ` (${incomplete.rooms.join(', ')})` : ''}. Continue where you left off, or start a new one?`,
          [
            { text: 'Start New', onPress: () => startFreshSession(token, isNewSignup) },
            { text: 'Continue', onPress: () => resumeProject(incomplete) },
          ]
        );
        return;
      }
    } catch (listError) {
      console.log('ℹ️  Could not list projects (continuing with a new one):', listError.message);
    }

    await startFreshSession(token, isNewSignup);
  };

  /**
   * LiabilityScreen's "I Agree" handler. Records acceptance server-side
   * (so it's never shown again for this account), then resumes exactly
   * the auth flow initializeAfterAuth was interrupted from.
   */
  const handleAcceptLiability = async () => {
    if (!pendingAuthContext) return;
    const { token, user, isNewSignup } = pendingAuthContext;
    try {
      await axios.post(`${API_BASE_URL}/auth/accept-liability`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: SESSION_CREATE_TIMEOUT,
      });
    } catch (error) {
      console.error('❌ Failed to record liability acceptance:', error);
      Alert.alert('Connection Error', `Couldn't save your acceptance. Please try again.\n\n${error.message}`);
      return;
    }
    const updatedUser = { ...user, liability_accepted: true };
    setAuthUser(updatedUser);
    setPendingAuthContext(null);
    await initializeAfterAuth(token, updatedUser, isNewSignup);
  };

  /**
   * Reuses an existing (incomplete) project instead of creating a new
   * session. If exactly one room is still in progress, there's nothing to
   * pick — jump straight back into that room at whatever step it was left
   * on (see computeRoomResumeTarget) instead of always detouring through
   * Room Selection first. With zero or multiple in-progress rooms, Room
   * Selection is still the right place to choose.
   */
  const resumeProject = async (project) => {
    const uniqueRooms = [...new Set(project.rooms || [])];
    setSessionId(project.id);
    // The project list only gives room type names, not their status — fetch
    // the full record so Room Selection can tell in-progress rooms (offer
    // Resume/Start Over) apart from actually-completed ones (locked).
    const roomStatuses = await fetchRoomStatuses(API_BASE_URL, project.id);
    const inProgressRooms = Object.keys(roomStatuses).filter((key) => roomStatuses[key] === 'in_progress');

    if (inProgressRooms.length === 1) {
      const roomKey = inProgressRooms[0];
      const roomIndex = uniqueRooms.indexOf(roomKey);
      const detail = await fetchProjectDetail(API_BASE_URL, project.id);
      const target = detail ? computeRoomResumeTarget(detail, roomKey) : { screen: 'roomSelection' };
      const roomLabel = (ROOM_TYPES[roomKey] || (appData.customRoomConfigs || {})[roomKey] || {}).name || roomKey;
      setAppData((prev) => ({
        ...prev,
        consentGiven: true,
        selectedRooms: uniqueRooms,
        roomStatuses,
        currentRoomIndex: roomIndex === -1 ? uniqueRooms.length : roomIndex,
        currentRoom: roomKey,
        currentRoomLabel: roomLabel,
        detectedItems: target.detectedItems || [],
        selectedItems: target.selectedItems || [],
        workingItems: target.selectedItems || null,
        currentItemIndex: target.currentItemIndex || 0,
        currentItem: target.currentItem || null,
        currentContext: target.currentContext || null,
        chatPathLabel: target.chatPathLabel || null,
        followUpPhotoGuidance: target.followUpPhotoGuidance || [],
        currentRecommendation: target.currentRecommendation || null,
        resumeChat: target.resumeChat || null,
      }));
      setConnectionStatus('connected');
      goToScreen(target.screen || 'roomSelection', { resetHistory: true });
      return;
    }

    setAppData((prev) => ({
      ...prev,
      consentGiven: true,
      selectedRooms: uniqueRooms,
      roomStatuses,
      currentRoomIndex: uniqueRooms.length,
      currentRoom: null,
    }));
    setConnectionStatus('connected');
    goToScreen('roomSelection', { resetHistory: true });
  };

  /**
   * Called from the Projects tab when the user taps a project. A finished
   * project (has_report) jumps straight to its Final Report — the backend
   * now reuses the cached report text instead of re-generating it (see
   * /report/generate's force_regenerate handling), so revisiting old
   * projects doesn't burn a fresh Gemini call every time. An in-progress
   * project resumes the same way as the post-login "Continue?" prompt.
   */
  const onOpenProject = (project) => {
    if (project.has_report) {
      setSessionId(project.id);
      setConnectionStatus('connected');
      goToScreen('finalReport', { resetHistory: true });
    } else {
      resumeProject(project);
    }
    setActiveTab('home');
  };

  const startFreshSession = async (token, isNewSignup = false) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/session/create`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: SESSION_CREATE_TIMEOUT,
      });
      if (response.data && response.data.success) {
        setSessionId(response.data.session_id);
        setConnectionStatus('connected');
        // New accounts see the onboarding screen once, right after signup;
        // returning logins skip straight to consent.
        goToScreen(isNewSignup ? 'onboarding' : 'consent', { resetHistory: true });
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('❌ Session creation failed:', error);
      setConnectionStatus('error');
      Alert.alert(
        'Session Error',
        `Failed to start a new project.\n\n${error.response?.data?.error || error.message}`,
        [
          { text: 'Retry', onPress: () => startFreshSession(token, isNewSignup) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  // Screen navigation functions.
  // CHANGED (bug fix): these used to be declared AFTER the fontsLoaded
  // early-return checks below. That's fine for functions only ever called
  // from render/JSX (which can't run until fonts are loaded anyway) — but
  // checkStoredAuth() (wired to a mount-only useEffect above) can call
  // resumeProject()/startFreshSession(), which call goToScreen(), and that
  // effect fires after the very FIRST render commit. Fonts are essentially
  // never loaded yet on that first render, so the component returned null
  // before ever reaching the old `const goToScreen = ...` line — meaning
  // goToScreen was still undefined in the closure captured by that effect,
  // producing "goToScreen is not a function" the first time a user hit
  // Resume right after opening the app. Declaring these before the early
  // returns means they're always defined regardless of font-load timing.
  const updateData = (newData) => {
    console.log('📝 Updating app data:', Object.keys(newData));
    setAppData(prev => ({ ...prev, ...newData }));
  };

  /**
   * Fully resets local app state back to its defaults and provisions a
   * brand new backend session, e.g. for "Restart Session" in the sidebar
   * or "Start Over" on the final report. Deliberately does NOT touch the
   * OLD project record — it's a soft reset, so the abandoned session stays
   * resumable later from the Projects tab, matching how the rest of the
   * app never destructively deletes a project on the user's behalf. A
   * fresh session id is required (not just null) because every screen from
   * Room Selection onward assumes a valid session_id is already set —
   * without this, "Get Started" on the Welcome screen would silently fail
   * the moment it tried to detect items with no session.
   */
  const resetAppData = async () => {
    setAppData({ ...initialAppData, consentGiven: true });
    setSessionId(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/session/create`, {}, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        timeout: SESSION_CREATE_TIMEOUT,
      });
      if (response.data && response.data.success) {
        setSessionId(response.data.session_id);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('❌ Failed to start a fresh session on restart:', error);
      Alert.alert(
        'Connection Error',
        `Couldn't start a new session.\n\n${error.response?.data?.error || error.message}`
      );
    }
    goToScreen('welcome', { resetHistory: true });
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

  // Render current screen
  const renderScreen = () => {
    const sharedProps = {
      apiBaseUrl: API_BASE_URL,
      sessionId,
      appData,
      updateData,
      resetAppData,
      goToScreen,
      goBack,
      canGoBack,
      connectionStatus,
      authUser,
      onLogout: handleLogout,
    };

    switch (currentScreen) {
      case 'authLoading':
        return (
          <View style={styles.authLoadingContainer}>
            <ActivityIndicator size="large" color="rgb(151, 188, 200)" />
          </View>
        );
      case 'login':
        return <LoginScreen {...sharedProps} onAuthenticated={handleAuthenticated} />;
      case 'signup':
        return <SignupScreen {...sharedProps} onAuthenticated={handleAuthenticated} />;
      case 'liability':
        return <LiabilityScreen {...sharedProps} onAccept={handleAcceptLiability} />;
      case 'onboarding':
        return <OnboardingScreen {...sharedProps} />;
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
      case 'directionPhotos':
        return <DirectionPhotosScreen {...sharedProps} />;
      case 'recommendations':
        return <RecommendationsScreen {...sharedProps} />;
      case 'finalReport':
        return <FinalReportScreen {...sharedProps} />;
      default:
        console.warn('⚠️  Unknown screen:', currentScreen);
        return <ConsentScreen {...sharedProps} />;
    }
  };

  // CHANGED (Projects tab): a slim top tab strip, not a bottom bar — every
  // screen's primary action footer is already `position: absolute; bottom:
  // 0`, so a persistent bottom tab bar would sit on top of Continue/Save/
  // Skip buttons on nearly every screen. A top strip avoids that collision
  // entirely while still being always visible once logged in. Deliberately
  // only these two tabs, per direction: the active flow ("Home") and the
  // project list ("Projects") — no other persistent navigation.
  // CHANGED (bug fix): 'consent' used to be reachable via the tab bar,
  // which was harmless before the Home-tab redesign (tapping Home just
  // re-showed whatever currentScreen already was) but became a real gate
  // bypass once Home started actively navigating to 'welcome' on every
  // tap — Projects, then Home, skipped straight past the "I Agree,
  // Continue" gate entirely. Excluding every gating screen (not just
  // consent) here means the tab bar simply isn't reachable at all until
  // its gate is cleared, which is the same protection 'liability' and
  // 'onboarding' already had.
  const showTabBar = authUser && !['authLoading', 'login', 'signup', 'onboarding', 'liability', 'consent'].includes(currentScreen);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {showTabBar && (
        <SafeAreaView style={styles.tabBarSafeArea}>
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'home' && styles.tabItemActive]}
              onPress={() => {
                // CHANGED (Home tab redesign): tapping Home used to just
                // flip `activeTab` back to 'home', which showed whatever
                // `currentScreen` already was — e.g. still deep in a
                // bedroom's photo step, with no way to tell this button
                // was even supposed to take you anywhere. It now actually
                // navigates to the Welcome/Home screen every time, which
                // itself offers Continue vs. Start a New Project.
                setActiveTab('home');
                goToScreen('welcome', { resetHistory: true });
              }}
            >
              <Icon name="home" size={16} color={activeTab === 'home' ? Colors.accent : Colors.textLight} style={styles.tabIcon} />
              <Text style={[styles.tabText, activeTab === 'home' && styles.tabTextActive]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'projects' && styles.tabItemActive]}
              onPress={() => setActiveTab('projects')}
            >
              <Icon name="folder" size={16} color={activeTab === 'projects' ? Colors.accent : Colors.textLight} style={styles.tabIcon} />
              <Text style={[styles.tabText, activeTab === 'projects' && styles.tabTextActive]}>Projects</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => setSidebarVisible(true)}
              accessibilityLabel="Profile and settings"
            >
              <Text style={styles.profileButtonText}>{(authUser?.email || '?').charAt(0).toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
      {showTabBar && activeTab === 'projects' ? (
        <ProjectsScreen
          apiBaseUrl={API_BASE_URL}
          onOpenProject={onOpenProject}
          onStartNewProject={() => { setActiveTab('home'); resetAppData(); }}
        />
      ) : (
        renderScreen()
      )}
      <SidebarMenu
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        authUser={authUser}
        onLogout={handleLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  tabBarSafeArea: {
    backgroundColor: '#FFFFFF',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
    backgroundColor: '#FFFFFF',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabIcon: {
    marginRight: 6,
  },
  tabItemActive: {
    borderBottomColor: 'rgb(151, 188, 200)',
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#8E8E93',
  },
  tabTextActive: {
    color: 'rgb(85, 91, 110)',
  },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgb(151, 188, 200)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginRight: 14,
  },
  profileButtonText: {
    fontSize: 14,
    fontFamily: 'Montserrat_700Bold',
    color: '#FFFFFF',
  },
  authLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});