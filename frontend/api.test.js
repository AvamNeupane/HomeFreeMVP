/**
 * Unit tests for computeRoomResumeTarget() and roomMatchesKey() — the
 * pure-logic core of the room-resume feature. These are the functions
 * that decide which screen a resumed session lands on, and they're
 * exactly what shipped a crash (`Cannot read property 'icon' of
 * undefined`) untested earlier this session, plus exposed the older
 * room_key/type key-mismatch bug. No RN rendering, no network — just
 * plain objects in, a target descriptor out.
 */

import { computeRoomResumeTarget, roomMatchesKey } from './api';

const baseRoom = (overrides = {}) => ({
  type: 'Bedroom',
  room_key: 'bedroom',
  status: 'in_progress',
  items: [],
  ...overrides,
});

describe('computeRoomResumeTarget', () => {
  test('no room matches roomType at all → photoGuidance', () => {
    const project = { rooms: [baseRoom({ room_key: 'kitchen' })] };
    expect(computeRoomResumeTarget(project, 'bedroom')).toEqual({ screen: 'photoGuidance' });
  });

  test('matching room exists but is completed, not in_progress → photoGuidance', () => {
    const project = { rooms: [baseRoom({ status: 'completed', items: [{ name: 'Closet' }] })] };
    expect(computeRoomResumeTarget(project, 'bedroom')).toEqual({ screen: 'photoGuidance' });
  });

  test('matching room exists but is discarded → photoGuidance', () => {
    const project = { rooms: [baseRoom({ status: 'discarded', items: [{ name: 'Closet' }] })] };
    expect(computeRoomResumeTarget(project, 'bedroom')).toEqual({ screen: 'photoGuidance' });
  });

  test('room found, no items detected yet → photoGuidance', () => {
    const project = { rooms: [baseRoom({ items: [] })] };
    expect(computeRoomResumeTarget(project, 'bedroom')).toEqual({ screen: 'photoGuidance' });
  });

  test('items present, no selected_items yet → itemSelection with detectedItems', () => {
    const items = [{ name: 'Closet' }, { name: 'Dresser' }];
    const project = { rooms: [baseRoom({ items })] };
    expect(computeRoomResumeTarget(project, 'bedroom')).toEqual({
      screen: 'itemSelection',
      detectedItems: items,
    });
  });

  test('selected item has no matching area entry yet → areaPhoto', () => {
    const items = [{ name: 'Closet' }];
    const selectedItems = [{ name: 'Closet' }];
    const project = { rooms: [baseRoom({ items, selected_items: selectedItems, areas: [] })] };
    const target = computeRoomResumeTarget(project, 'bedroom');
    expect(target.screen).toBe('areaPhoto');
    expect(target.currentItem).toEqual({ name: 'Closet' });
    expect(target.currentItemIndex).toBe(0);
  });

  test('area exists, no measurements recorded for it yet → measureSpace', () => {
    const items = [{ name: 'Closet' }];
    const selectedItems = [{ name: 'Closet' }];
    const project = {
      rooms: [baseRoom({
        items, selected_items: selectedItems,
        areas: [{ name: 'Closet', context: 'A closet with hanging clothes.' }],
      })],
      measurements: {},
    };
    const target = computeRoomResumeTarget(project, 'bedroom');
    expect(target.screen).toBe('measureSpace');
    expect(target.currentContext).toBe('A closet with hanging clothes.');
  });

  test('measurements recorded, chat not started yet → intentionQuestion with empty resumeChat', () => {
    const items = [{ name: 'Closet' }];
    const selectedItems = [{ name: 'Closet' }];
    const project = {
      rooms: [baseRoom({
        items, selected_items: selectedItems,
        areas: [{ name: 'Closet', context: 'ctx' }],
      })],
      measurements: { Closet: { skipped: true } },
      chat: {},
    };
    const target = computeRoomResumeTarget(project, 'bedroom');
    expect(target.screen).toBe('intentionQuestion');
    expect(target.resumeChat).toEqual({ messages: [], pathOptions: [] });
  });

  test('chat in progress (messages exist, not done) → intentionQuestion, messages mapped to natasha/user', () => {
    const items = [{ name: 'Closet' }];
    const selectedItems = [{ name: 'Closet' }];
    const project = {
      rooms: [baseRoom({
        items, selected_items: selectedItems,
        areas: [{ name: 'Closet', context: 'ctx' }],
      })],
      measurements: { Closet: { skipped: true } },
      chat: {
        Closet: {
          messages: [
            { role: 'assistant', text: 'What is your goal?' },
            { role: 'user', text: 'Declutter it.' },
          ],
          path_options: [],
        },
      },
    };
    const target = computeRoomResumeTarget(project, 'bedroom');
    expect(target.screen).toBe('intentionQuestion');
    expect(target.resumeChat.messages).toEqual([
      { role: 'natasha', text: 'What is your goal?' },
      { role: 'user', text: 'Declutter it.' },
    ]);
    expect(target.resumeChat.pathOptions).toEqual([]);
  });

  test('chat done (path_options present) but no direction chosen yet → intentionQuestion with pathOptions restored', () => {
    const items = [{ name: 'Closet' }];
    const selectedItems = [{ name: 'Closet' }];
    const pathOptions = [{ key: 'mess_cleanup', label: 'Mess Cleanup' }];
    const project = {
      rooms: [baseRoom({
        items, selected_items: selectedItems,
        areas: [{ name: 'Closet', context: 'ctx' }],  // no chat_path yet
      })],
      measurements: { Closet: { skipped: true } },
      chat: { Closet: { messages: [{ role: 'assistant', text: 'Pick a direction.' }], path_options: pathOptions } },
    };
    const target = computeRoomResumeTarget(project, 'bedroom');
    expect(target.screen).toBe('intentionQuestion');
    expect(target.resumeChat.pathOptions).toEqual(pathOptions);
  });

  test('direction confirmed, no recommendations yet → directionPhotos with guidance restored', () => {
    const items = [{ name: 'Closet' }];
    const selectedItems = [{ name: 'Closet' }];
    const project = {
      rooms: [baseRoom({
        items, selected_items: selectedItems,
        areas: [{
          name: 'Closet', context: 'ctx',
          chat_path: 'mess_cleanup', chat_path_label: 'Mess Cleanup',
          follow_up_photo_guidance: [{ label: 'messiest_spot', title: 'Messiest Spot' }],
        }],
      })],
      measurements: { Closet: { skipped: true } },
      chat: { Closet: { messages: [], path_options: [{ key: 'mess_cleanup' }] } },
    };
    const target = computeRoomResumeTarget(project, 'bedroom');
    expect(target.screen).toBe('directionPhotos');
    expect(target.chatPathLabel).toBe('Mess Cleanup');
    expect(target.followUpPhotoGuidance).toEqual([{ label: 'messiest_spot', title: 'Messiest Spot' }]);
  });

  test('recommendations already generated (room not yet flipped to completed) → recommendations screen, reconstructed', () => {
    const items = [{ name: 'Closet' }];
    const selectedItems = [{ name: 'Closet' }];
    const project = {
      rooms: [baseRoom({
        items, selected_items: selectedItems,
        areas: [{
          name: 'Closet', context: 'ctx', chat_path: 'mess_cleanup',
          recommendations: 'Group everything by category.',
          products: [{ name: 'Bin' }],
          user_intention: 'Declutter it.',
        }],
      })],
      measurements: { Closet: { skipped: true } },
      chat: { Closet: { messages: [], path_options: [{ key: 'mess_cleanup' }] } },
    };
    const target = computeRoomResumeTarget(project, 'bedroom');
    expect(target.screen).toBe('recommendations');
    expect(target.currentRecommendation).toEqual({
      area: 'Closet',
      intention: 'Declutter it.',
      recommendations: 'Group everything by category.',
      products: [{ name: 'Bin' }],
    });
  });

  test('multiple selected items: first done, second not → currentItemIndex advances to the second', () => {
    const items = [{ name: 'Closet' }, { name: 'Dresser' }];
    const selectedItems = [{ name: 'Closet' }, { name: 'Dresser' }];
    const project = {
      rooms: [baseRoom({
        items, selected_items: selectedItems,
        areas: [
          { name: 'Closet', context: 'ctx1', recommendations: 'Done with the closet.' },
          { name: 'Dresser', context: 'ctx2' },  // not done yet
        ],
      })],
      measurements: { Closet: { skipped: true }, Dresser: { skipped: true } },
      chat: { Dresser: { messages: [], path_options: [] } },
    };
    const target = computeRoomResumeTarget(project, 'bedroom');
    expect(target.currentItemIndex).toBe(1);
    expect(target.currentItem).toEqual({ name: 'Dresser' });
    expect(target.screen).toBe('intentionQuestion');
  });

  test('multiple rooms of the same room_key: picks the most recent in_progress entry', () => {
    const project = {
      rooms: [
        baseRoom({ status: 'discarded', items: [{ name: 'Old Closet' }] }),
        baseRoom({ status: 'in_progress', items: [{ name: 'New Closet' }] }),
      ],
    };
    const target = computeRoomResumeTarget(project, 'bedroom');
    expect(target.screen).toBe('itemSelection');
    expect(target.detectedItems).toEqual([{ name: 'New Closet' }]);
  });
});

describe('roomMatchesKey', () => {
  test('matches on room_key when present', () => {
    expect(roomMatchesKey({ type: 'Craft Room', room_key: 'custom_craft_room_a1b2' }, 'custom_craft_room_a1b2')).toBe(true);
    expect(roomMatchesKey({ type: 'Craft Room', room_key: 'custom_craft_room_a1b2' }, 'custom_craft_room_c3d4')).toBe(false);
  });

  test('falls back to type for a legacy room record with no room_key', () => {
    // The exact regression class this session's bug came from: an older
    // room record persisted before room_key existed only has `type`.
    expect(roomMatchesKey({ type: 'bedroom' }, 'bedroom')).toBe(true);
    expect(roomMatchesKey({ type: 'Bedroom' }, 'bedroom')).toBe(false); // case must still match — no fuzzy matching
  });

  test('two rooms sharing the same display label are NOT conflated when room_key differs', () => {
    const roomA = { type: 'Craft Room', room_key: 'custom_craft_room_a1b2' };
    const roomB = { type: 'Craft Room', room_key: 'custom_craft_room_c3d4' };
    expect(roomMatchesKey(roomA, 'custom_craft_room_c3d4')).toBe(false);
    expect(roomMatchesKey(roomB, 'custom_craft_room_c3d4')).toBe(true);
  });
});
