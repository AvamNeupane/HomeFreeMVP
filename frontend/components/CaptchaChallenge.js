/**
 * CaptchaChallenge — invisible/managed Cloudflare Turnstile check.
 *
 * Turnstile is a web widget (Cloudflare's servers score the request), not a
 * native mobile component, so it runs inside a small bundled HTML page
 * loaded in a WebView. In "interaction-only" mode it stays invisible for
 * almost every real user; the popup you see below only actually renders a
 * checkbox if Cloudflare's servers decide this particular attempt needs one.
 *
 * Usage: hold a ref, call `await captchaRef.current.execute()` right before
 * a signup/login submit — it resolves with a verification token to send to
 * the backend as `captcha_token`, or rejects if verification fails.
 */

import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { Modal, View, StyleSheet, ActivityIndicator, Text, InteractionManager } from 'react-native';
import { WebView } from 'react-native-webview';

// How long to wait for the widget to finish loading/rendering before giving
// up on a single execute() call, and the hard ceiling on the whole exchange
// (loading + Cloudflare scoring + any interactive checkbox) before we stop
// waiting entirely rather than spin forever.
const READY_TIMEOUT_MS = 15000;
const OVERALL_TIMEOUT_MS = 30000;
const READY_POLL_MS = 200;

const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

function buildTurnstileHtml(siteKey) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    body { display: flex; align-items: center; justify-content: center; }
  </style>
</head>
<body>
  <div id="widget"></div>
  <script>
    var widgetId = null;
    function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
    function renderWidget() {
      if (!window.turnstile) { setTimeout(renderWidget, 100); return; }
      widgetId = window.turnstile.render('#widget', {
        sitekey: '${siteKey}',
        appearance: 'interaction-only',
        execution: 'execute',
        callback: function (token) { post({ type: 'success', token: token }); },
        'error-callback': function (code) { post({ type: 'error', code: code }); },
        'expired-callback': function () { post({ type: 'expired' }); }
      });
      post({ type: 'ready' });
    }
    renderWidget();
    window.runTurnstile = function () {
      if (window.turnstile && widgetId !== null) { window.turnstile.execute(widgetId); }
    };
  </script>
</body>
</html>`;
}

const CaptchaChallenge = forwardRef(function CaptchaChallenge(_props, ref) {
  const webViewRef = useRef(null);
  const resolverRef = useRef(null);
  const isReadyRef = useRef(false);
  const hasExecutedOnceRef = useRef(false);
  const overallTimeoutRef = useRef(null);
  const [visible, setVisible] = useState(false);
  // FIX (second stuck-loading loop, after a failed attempt + retry):
  // Cloudflare's own reset()-then-execute() has the exact same load/render
  // race we already fixed for the first run — reset() isn't instant, so
  // calling execute() right after it in the same tick can go nowhere. Not
  // worth chasing that timing precisely: a retry instead forces a fully
  // fresh widget by remounting the WebView (new `key`), which sidesteps
  // Cloudflare's internal reset lifecycle entirely.
  const [webviewKey, setWebviewKey] = useState(0);
  // FIX (slow screen transition): mounting the WebView is a genuinely heavy
  // native operation (cold WebView init + fetching Cloudflare's script), and
  // doing it in the same render pass as the rest of the screen made the
  // whole Login/Signup screen feel sluggish to appear. Deferring it to
  // after the screen's own first paint lets the visible UI (inputs,
  // buttons) show up immediately while this loads unobtrusively after.
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setShouldMount(true));
    return () => task.cancel();
  }, []);

  const settle = (fn, arg) => {
    if (overallTimeoutRef.current) {
      clearTimeout(overallTimeoutRef.current);
      overallTimeoutRef.current = null;
    }
    setVisible(false);
    resolverRef.current?.[fn](arg);
    resolverRef.current = null;
  };

  useImperativeHandle(ref, () => ({
    execute: () =>
      new Promise((resolve, reject) => {
        if (!TURNSTILE_SITE_KEY) {
          reject(new Error('Captcha is not configured (missing EXPO_PUBLIC_TURNSTILE_SITE_KEY).'));
          return;
        }
        resolverRef.current = { resolve, reject };
        setVisible(true);

        if (hasExecutedOnceRef.current) {
          // A retry — force a brand new widget instance instead of
          // reusing/resetting the old one (see FIX note above).
          isReadyRef.current = false;
          setWebviewKey((k) => k + 1);
        }
        hasExecutedOnceRef.current = true;

        // Overall safety net: no matter what state the widget/network is
        // in, never leave the caller hanging forever.
        overallTimeoutRef.current = setTimeout(() => {
          settle('reject', new Error('Verification is taking too long — check your connection and try again.'));
        }, OVERALL_TIMEOUT_MS);

        // FIX (stuck "Verifying..." spinner): the widget needs a moment to
        // load Cloudflare's script + render before it can actually run —
        // firing the "execute now" command before that finished used to be
        // a silent no-op (window.runTurnstile checked widgetId but nothing
        // ever retried), so the promise never resolved OR rejected. Now
        // poll for the 'ready' message before sending the run command, and
        // give up with a clear error instead of hanging if it never arrives.
        let waited = 0;
        const tryRun = () => {
          if (!resolverRef.current) return; // already settled (e.g. overall timeout fired)
          if (isReadyRef.current) {
            webViewRef.current?.injectJavaScript('window.runTurnstile && window.runTurnstile(); true;');
            return;
          }
          waited += READY_POLL_MS;
          if (waited >= READY_TIMEOUT_MS) {
            settle('reject', new Error('Captcha did not load in time — check your internet connection and try again.'));
            return;
          }
          setTimeout(tryRun, READY_POLL_MS);
        };
        tryRun();
      }),
  }));

  const handleMessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch (e) {
      return;
    }
    if (data.type === 'ready') {
      isReadyRef.current = true;
      return;
    }
    if (data.type === 'success') {
      settle('resolve', data.token);
    } else if (data.type === 'error') {
      // Surfacing Cloudflare's real error code instead of a generic message
      // — a fast, consistent failure (rather than a timeout) usually means
      // a Turnstile *configuration* problem, not a network/timing issue:
      // most commonly the domain this page is served from isn't in the
      // site's allowed domains list in the Cloudflare dashboard. Error code
      // 110200 specifically means "domain not allowed".
      settle('reject', new Error(`Verification failed (Cloudflare error ${data.code || 'unknown'}) — please try again.`));
    } else if (data.type === 'expired') {
      settle('reject', new Error('Verification expired — please try again.'));
    }
  };

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ActivityIndicator color="#97BCC8" style={styles.spinner} />
          <Text style={styles.text}>Verifying you're human...</Text>
          <View style={styles.webviewBox}>
            {shouldMount && (
              <WebView
                key={webviewKey}
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html: buildTurnstileHtml(TURNSTILE_SITE_KEY) }}
                onMessage={handleMessage}
                onError={() => settle('reject', new Error('Could not load the captcha — check your internet connection.'))}
                onHttpError={() => settle('reject', new Error('Could not load the captcha — check your internet connection.'))}
                style={styles.webview}
                javaScriptEnabled
                scrollEnabled={false}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
});

export default CaptchaChallenge;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, alignItems: 'center', width: 300 },
  spinner: { marginBottom: 10 },
  text: { fontSize: 14, color: '#333333', marginBottom: 12 },
  webviewBox: { width: 280, height: 70, overflow: 'hidden' },
  webview: { backgroundColor: 'transparent' },
});
