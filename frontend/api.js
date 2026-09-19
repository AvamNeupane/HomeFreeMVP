/**
 * Shared authenticated fetch wrapper.
 *
 * CHANGED (bug fix): every screen called the backend with plain `fetch()`.
 * Only App.js's axios calls ever attached the login token (via
 * axios.defaults.headers.common) — axios and fetch are separate HTTP
 * clients, so that default never applied to any of the screens' actual
 * feature calls. The moment an endpoint started checking ownership (e.g.
 * PATCH /projects/:id when saving a project), every one of those calls
 * failed with "unauthorized" because no Authorization header was ever
 * sent. apiFetch() is a drop-in replacement for fetch() that always
 * attaches the current token, kept in sync by App.js on every login/
 * logout/token-refresh.
 */

import { File } from 'expo-file-system';

let authToken = null;

export function setApiAuthToken(token) {
  authToken = token;
}

export function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return fetch(url, { ...options, headers });
}

/**
 * Appends a locally-captured photo (an `expo-image-picker` file:// uri) to
 * a FormData as a real uploadable file part.
 *
 * CHANGED (SDK 57 breaking change): Expo SDK 57 installs its own
 * spec-compliant `fetch` as the global `fetch`, replacing React Native's
 * legacy one. The legacy one accepted a plain `{ uri, type, name }` object
 * as a FormData "file" part (a long-standing RN-only convention); the new
 * one only accepts real Blob-like parts (anything with `.arrayBuffer()`/
 * `.bytes()`), and throws "Unsupported FormDataPart implementation" on the
 * old shape — silently, before the request is even sent, which is why it
 * always looked like a network/connectivity failure. `expo-file-system`'s
 * `File` class implements Blob and reads directly from the on-device path,
 * so wrapping the uri in one is the fix — used at every photo-upload call
 * site in place of the old inline object literal.
 */
export function appendImageFile(formData, key, uri, filename) {
  formData.append(key, new File(uri), filename);
}

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * fetch() with a hard timeout — plain fetch() never times out on its own,
 * so a wrong/stale backend IP (or the backend just being down) hangs the
 * caller forever instead of failing with a clear error. Used by Login/
 * SignupScreen, which run before any auth token exists (so apiFetch's
 * token-attaching isn't relevant there).
 */
export function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * A room's stable identity server-side is `room_key` (e.g. "bedroom", or a
 * custom room's slug) — distinct from `type`, which is the human-readable
 * label sent to the AI prompts (e.g. "Bedroom") and isn't guaranteed to
 * match the frontend's internal key in case or spacing. Older room entries
 * created before room_key existed only have `type`, so this falls back to
 * comparing against that.
 */
export const roomMatchesKey = (room, roomKey) => (room.room_key || room.type) === roomKey;

/**
 * Flip a room's status ('in_progress' | 'completed' | 'discarded') on the
 * server. The generic PATCH /projects/:id route does a shallow merge, so
 * to change just one room's status without clobbering the `areas`/
 * `overview_images` data the backend has already recorded for it, this
 * reads the current `rooms` array first, edits the most recent entry that
 * matches `roomType`, and PATCHes the whole array back.
 */
export async function updateRoomStatus(apiBaseUrl, sessionId, roomType, status) {
  if (!sessionId || !roomType) return;
  try {
    const getRes = await apiFetch(`${apiBaseUrl}/projects/${sessionId}`);
    const getData = await getRes.json();
    if (!getData.success) return;

    const rooms = getData.project.rooms || [];
    let targetIndex = -1;
    for (let i = rooms.length - 1; i >= 0; i--) {
      if (roomMatchesKey(rooms[i], roomType)) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) return;

    const updatedRooms = rooms.map((room, i) => (i === targetIndex ? { ...room, status } : room));
    await apiFetch(`${apiBaseUrl}/projects/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rooms: updatedRooms }),
    });
  } catch (e) {
    console.log('⚠️  updateRoomStatus failed (non-fatal):', e.message);
  }
}

/** Fetch { [roomType]: status } for the given project, most recent entry per type wins. */
export async function fetchRoomStatuses(apiBaseUrl, sessionId) {
  if (!sessionId) return {};
  try {
    const res = await apiFetch(`${apiBaseUrl}/projects/${sessionId}`);
    const data = await res.json();
    if (!data.success) return {};
    const statuses = {};
    for (const room of data.project.rooms || []) {
      statuses[room.room_key || room.type] = room.status || 'in_progress';
    }
    return statuses;
  } catch (e) {
    console.log('⚠️  fetchRoomStatuses failed (non-fatal):', e.message);
    return {};
  }
}

/** Fetch the full raw project record (rooms/areas/chat/measurements) used to compute a deep resume target. Returns null on failure. */
export async function fetchProjectDetail(apiBaseUrl, sessionId) {
  if (!sessionId) return null;
  try {
    const res = await apiFetch(`${apiBaseUrl}/projects/${sessionId}`);
    const data = await res.json();
    if (!data.success) return null;
    return data.project;
  } catch (e) {
    console.log('⚠️  fetchProjectDetail failed (non-fatal):', e.message);
    return null;
  }
}

/**
 * Persists which items the user chose to organize for a room (Item
 * Selection's "Continue"), using the same read-modify-write pattern as
 * updateRoomStatus above. Without this, a resumed session would always
 * have to re-show Item Selection even if the user had already picked and
 * moved on, since nothing recorded that choice server-side before.
 */
export async function saveSelectedItems(apiBaseUrl, sessionId, roomType, selectedItems) {
  if (!sessionId || !roomType) return;
  try {
    const getRes = await apiFetch(`${apiBaseUrl}/projects/${sessionId}`);
    const getData = await getRes.json();
    if (!getData.success) return;

    const rooms = getData.project.rooms || [];
    let targetIndex = -1;
    for (let i = rooms.length - 1; i >= 0; i--) {
      if (roomMatchesKey(rooms[i], roomType)) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) return;

    const updatedRooms = rooms.map((room, i) => (i === targetIndex ? { ...room, selected_items: selectedItems } : room));
    await apiFetch(`${apiBaseUrl}/projects/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rooms: updatedRooms }),
    });
  } catch (e) {
    console.log('⚠️  saveSelectedItems failed (non-fatal):', e.message);
  }
}

/**
 * Works out exactly which screen an in-progress room was left on and what
 * appData needs to look like to land back there, using the room/area/chat
 * state persisted server-side (see fetchProjectDetail). Each item within a
 * room moves through a fixed sequence — areaPhoto -> measureSpace ->
 * intentionQuestion (chat) -> directionPhotos -> recommendations — and
 * every step along that sequence writes something identifiable server-side
 * (an area entry, a measurements record, a done chat with path_options, a
 * confirmed chat_path, or final recommendations), so the furthest
 * completed marker tells us exactly where to resume without needing a
 * separate "current step" field to keep in sync.
 */
export function computeRoomResumeTarget(project, roomType) {
  const rooms = (project && project.rooms) || [];
  let room = null;
  for (let i = rooms.length - 1; i >= 0; i--) {
    if (roomMatchesKey(rooms[i], roomType) && rooms[i].status === 'in_progress') {
      room = rooms[i];
      break;
    }
  }
  if (!room) return { screen: 'photoGuidance' };

  const items = room.items || [];
  if (items.length === 0) return { screen: 'photoGuidance' };

  const selectedItems = room.selected_items;
  if (!selectedItems || selectedItems.length === 0) {
    return { screen: 'itemSelection', detectedItems: items };
  }

  const areasByName = {};
  (room.areas || []).forEach((a) => { areasByName[a.name] = a; });

  let index = selectedItems.findIndex((item) => !(areasByName[item.name] || {}).recommendations);
  if (index === -1) index = selectedItems.length - 1;
  const currentItem = selectedItems[index];
  const area = areasByName[currentItem.name];

  const base = { detectedItems: items, selectedItems, currentItemIndex: index, currentItem };

  if (!area) {
    return { screen: 'areaPhoto', ...base };
  }

  const measurements = (project.measurements || {})[currentItem.name];
  if (!measurements) {
    return { screen: 'measureSpace', ...base, currentContext: area.context };
  }

  const chatState = (project.chat || {})[currentItem.name];
  const chatDone = !!(chatState && chatState.path_options && chatState.path_options.length > 0);
  if (!chatDone || !area.chat_path) {
    return {
      screen: 'intentionQuestion',
      ...base,
      currentContext: area.context,
      resumeChat: {
        messages: ((chatState && chatState.messages) || []).map((m) => ({
          role: m.role === 'assistant' ? 'natasha' : 'user',
          text: m.text,
        })),
        pathOptions: chatDone ? chatState.path_options : [],
      },
    };
  }

  if (!area.recommendations) {
    return {
      screen: 'directionPhotos',
      ...base,
      currentContext: area.context,
      chatPathLabel: area.chat_path_label,
      followUpPhotoGuidance: area.follow_up_photo_guidance || [],
    };
  }

  // Recommendations already exist for this item — it's fully done (the
  // room just hasn't flipped to 'completed' yet, e.g. the app closed
  // before RecommendationsScreen's completion PATCH fired). Land back on
  // its recap so the user can pick Next Item / Next Room / Finish again.
  return {
    screen: 'recommendations',
    ...base,
    currentContext: area.context,
    currentRecommendation: {
      area: currentItem.name,
      intention: area.user_intention,
      recommendations: area.recommendations,
      products: area.products || [],
    },
  };
}
