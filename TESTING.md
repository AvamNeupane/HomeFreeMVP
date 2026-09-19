# Testing

This app has two layers of tests, plus a manual checklist for everything neither layer can reach (real device UI, keyboard behavior, ImagePicker, PDF visuals, actual Gemini output, TestFlight).

## Backend (`backend/`)

Real Flask routes, hit through Flask's test client, against an isolated SQLite file (never the real `backend/roomscan.db`) with Gemini mocked out (never a real API call — deterministic, free, fast). A handful of auth/account tests need real Postgres (accounts are gated behind `DATABASE_URL`), so those spin up a throwaway local Postgres cluster for the run and skip cleanly if no local Postgres install is found.

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest -v
```

Should run in a few seconds, fully offline, and never touches Railway.

## Frontend (`frontend/`)

Unit tests for `computeRoomResumeTarget()` and `roomMatchesKey()` in `api.js` — the pure logic that decides which screen a resumed session lands on. No RN rendering involved.

```bash
cd frontend
npm install
npm test
```

**Not covered by either suite** — RN screen rendering/navigation, ImagePicker/camera flows, keyboard behavior, PDF visual layout, real Gemini output quality, the native AR measurement module, or the TestFlight/build pipeline. Wiring up `react-native-testing-library` with mocks for every native Expo module is a real, separate undertaking — worth doing if/when screen-level regressions start actually happening, not bundled in preemptively.

## Manual QA checklist

Not a one-time record — re-run the relevant section whenever you touch that area. Each item is a scenario + what should happen.

### Auth & session
- [ ] Fresh install, log in, force-quit the app, reopen → still logged in, no login screen shown.
- [ ] Manually expire/corrupt the stored token → sent to login screen.
- [ ] Turn off WiFi before opening the app (valid token still stored) → NOT logged out; either retries or shows a connection error, not the login screen.
- [ ] From the liability screen, tap Projects tab then Home tab → liability screen reappears, cannot be bypassed.
- [ ] Log out → relaunch → login screen, token gone.

### Room resume (walk each branch physically)
- [ ] Start a room, leave mid-photo-upload (before "Continue" on Photo Guidance), reopen via Projects → lands on Photo Guidance, re-upload works.
- [ ] Leave right after Item Selection's "Continue" (before any photos for the item) → lands on Area Photo.
- [ ] Leave mid-measurement (after Area Photo, before Measure Space is submitted) → lands on Measure Space.
- [ ] Leave mid-chat with Natasha (a few messages sent, not done yet) → lands on Intention Question, full conversation history visible, can keep chatting.
- [ ] Leave right after the chat offers path options but before tapping one → lands on Intention Question with the same path options showing.
- [ ] Leave after picking a direction, before Direction Photos is submitted → lands on Direction Photos with the same follow-up guidance shown.
- [ ] Leave right after recommendations are generated (before tapping Next Item/Room/Finish) → lands on the Recommendations screen showing that same recommendation.
- [ ] Exactly one room in progress → tapping the project in Projects skips Room Selection entirely.
- [ ] Two or more rooms in progress → tapping the project shows Room Selection; tapping an in-progress room resumes it correctly.
- [ ] Tap "Start This Room Over" on an in-progress room, then immediately try to resume the same room again → does not resume the discarded attempt.
- [ ] Create a custom room, leave mid-flow, force-quit the app (not just background), reopen → resumes without crashing, even though the custom room's local config is gone (generic icon is fine, a crash is not).
- [ ] Two custom rooms with the exact same typed name in one session → both resume independently, no cross-contamination.

### Photo upload
- [ ] Add 3+ photos to one category → all persist, all display as thumbnails.
- [ ] Keyboard open on a photo-description field → field stays visible, not covered.
- [ ] Add an extra photo + written description → shows up in the AI's response (check it's actually using the note).
- [ ] Upload completes without an "Unsupported FormDataPart" or similar network-layer error.

### Chat / AI
- [ ] Send an off-topic message mid-chat → guardrail reply shown, doesn't derail the conversation, still counts toward the question cap.
- [ ] Keep chatting past the question cap → still ends with usable path options, not stuck.
- [ ] On Area Photo, get asked for one more angle once → after providing it (or not), never asked again for that same area.

### PDF report
- [ ] Generate a report from a normal linear session → all sections present (Steps 1-5, donation reminder, weekly challenge, after-photos ask, feedback ask, next-space CTA), in order.
- [ ] Mid-sentence `**bold**` renders as actual bold, not literal asterisks.
- [ ] Product entries show dimensions + Amazon link where available.
- [ ] Generate a report from a project that was resumed (not entirely linear) → still renders correctly.

### Navigation / state
- [ ] "Restart Session" from the sidebar → truly empty state afterward (not just a cleared nav stack) — starting fresh doesn't show stale rooms/items.
- [ ] "Start Over" on the Final Report does the same full reset.
- [ ] "Organize Another Room" after finishing one room → earlier room's data is untouched.

### Release
- [ ] Fresh EAS build installs and opens via TestFlight without a captcha-config error.
- [ ] iOS build number was incremented before this submission.
