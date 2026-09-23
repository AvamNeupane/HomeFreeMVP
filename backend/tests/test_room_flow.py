"""
Covers the exact bug class found this session: a resume feature that reads
back room/area/chat/measurement state persisted by the room-organizing
flow (detect -> analyze -> chat -> confirm-direction -> measure ->
recommend) has to match rooms by a STABLE key, not the human-readable
display label sent to the AI prompts — those aren't the same string, and
comparing them silently breaks status tracking and resume for every room,
not just custom ones (see room_key on the room record below).

Every field asserted on here is a field frontend/api.js's
computeRoomResumeTarget() actually reads to decide which screen a resumed
session lands on — this suite exists to make sure the backend keeps
producing exactly the shape that function expects.
"""

import json

from conftest import fake_jpeg_file


def _create_session(client):
    res = client.post('/session/create')
    data = res.get_json()
    assert res.status_code == 200 and data['success']
    return data['session_id']


def _detect_items(client, session_id, room_type='Bedroom', room_key='bedroom'):
    data = {
        'session_id': session_id,
        'room_type': room_type,
        'room_key': room_key,
        'image0': fake_jpeg_file('wide_shot.jpg'),
    }
    res = client.post('/room/detect-items', data=data, content_type='multipart/form-data')
    return res


def _analyze_area(client, session_id, area_name='Closet', room_type='Bedroom', photo_labels=None):
    # A real multipart endpoint (like detect-items), not JSON — mirrors
    # AreaPhotoScreen.js, which builds FormData for this call.
    data = {
        'session_id': session_id,
        'area_name': area_name,
        'room_type': room_type,
        'photo_labels': json.dumps(photo_labels or []),
        'image0': fake_jpeg_file('closeup.jpg'),
    }
    return client.post('/area/analyze', data=data, content_type='multipart/form-data')


def _get_project(client, session_id):
    res = client.get(f'/projects/{session_id}')
    data = res.get_json()
    assert res.status_code == 200 and data['success'], data
    return data['project']


class TestRoomKeyPersistence:
    def test_detect_items_persists_type_room_key_and_items(self, sqlite_client, mock_gemini):
        session_id = _create_session(sqlite_client)
        mock_gemini.queue(json.dumps([
            {'name': 'Closet', 'confidence': 92, 'reason': 'Full of clothes'},
            {'name': 'Dresser', 'confidence': 80, 'reason': 'Cluttered surface'},
        ]))

        res = _detect_items(sqlite_client, session_id, room_type='Bedroom', room_key='bedroom')
        body = res.get_json()
        assert res.status_code == 200 and body['success'], body
        assert [i['name'] for i in body['items']] == ['Closet', 'Dresser']

        project = _get_project(sqlite_client, session_id)
        room = project['rooms'][-1]
        assert room['type'] == 'Bedroom'          # human label, sent to AI prompts
        assert room['room_key'] == 'bedroom'       # stable key, used for status/resume matching
        assert room['status'] == 'in_progress'
        assert [i['name'] for i in room['items']] == ['Closet', 'Dresser']

    def test_two_custom_rooms_with_the_same_display_name_stay_distinct(self, sqlite_client, mock_gemini):
        """Two custom rooms can easily share a display label ('Craft Room')
        while having different internal slugs — room_key is what has to
        disambiguate them, not type."""
        session_id = _create_session(sqlite_client)
        mock_gemini.queue(json.dumps([{'name': 'Shelf', 'confidence': 70, 'reason': 'x'}]))
        _detect_items(sqlite_client, session_id, room_type='Craft Room', room_key='custom_craft_room_a1b2')

        mock_gemini.queue(json.dumps([{'name': 'Bin', 'confidence': 60, 'reason': 'y'}]))
        _detect_items(sqlite_client, session_id, room_type='Craft Room', room_key='custom_craft_room_c3d4')

        project = _get_project(sqlite_client, session_id)
        keys = [r['room_key'] for r in project['rooms']]
        assert keys == ['custom_craft_room_a1b2', 'custom_craft_room_c3d4']
        # Both share the exact same display label — matching by `type` alone
        # (the pre-fix behavior) could never tell these two apart.
        assert all(r['type'] == 'Craft Room' for r in project['rooms'])


class TestFullRoomFlowPersistence:
    """Walks one item all the way from photo upload through to a generated
    recommendation, asserting every field a deep resume needs to read is
    actually there afterward — this is the sequence
    computeRoomResumeTarget() (frontend/api.js) is designed against."""

    def test_full_flow_persists_everything_for_resume(self, sqlite_client, mock_gemini):
        session_id = _create_session(sqlite_client)

        # 1) Room detection.
        mock_gemini.queue(json.dumps([{'name': 'Closet', 'confidence': 90, 'reason': 'Cluttered'}]))
        res = _detect_items(sqlite_client, session_id, room_type='Bedroom', room_key='bedroom')
        assert res.status_code == 200

        # 2) Area analysis (close-up photos of the chosen item).
        mock_gemini.queue(json.dumps({
            'question': 'What do you want to keep easily accessible in this closet?',
            'context': 'A closet with hanging clothes and a cluttered top shelf.',
            'additional_angles': [],
        }))
        res = _analyze_area(sqlite_client, session_id, photo_labels=['wide_shot'])
        assert res.status_code == 200, res.get_json()

        # 3) Chat — first turn (no user_message yet), not done.
        mock_gemini.queue(json.dumps({
            'reply': "What's the main goal for this closet?",
            'done': False,
            'path_options': [],
            'guardrail_triggered': False,
        }))
        res = sqlite_client.post('/area/chat', json={
            'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Bedroom',
        })
        assert res.status_code == 200 and res.get_json()['done'] is False

        # 3b) Chat — second turn, user answers, model wraps up with path options.
        mock_gemini.queue(json.dumps({
            'reply': "Got it — here's what I'd suggest.",
            'done': True,
            'path_options': [
                {'key': 'mess_cleanup', 'label': 'Mess Cleanup', 'description': 'Declutter what is there'},
                {'key': 'style_refresh', 'label': 'Style Refresh', 'description': 'Make it look nicer'},
            ],
            'guardrail_triggered': False,
        }))
        res = sqlite_client.post('/area/chat', json={
            'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Bedroom',
            'user_message': 'I want it decluttered and easy to use.',
        })
        chat_body = res.get_json()
        assert res.status_code == 200 and chat_body['done'] is True
        assert len(chat_body['path_options']) == 2

        # 4) Confirm direction — also asks Gemini for follow-up photo guidance.
        mock_gemini.queue(json.dumps([
            {'label': 'messiest_spot', 'title': 'Messiest Spot', 'description': 'Close-up of the worst clutter'},
        ]))
        res = sqlite_client.post('/area/confirm-direction', json={
            'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Bedroom',
            'selected_path': {'key': 'mess_cleanup', 'label': 'Mess Cleanup'},
        })
        confirm_body = res.get_json()
        assert res.status_code == 200, confirm_body
        assert confirm_body['chat_path'] == 'mess_cleanup'
        assert len(confirm_body['follow_up_photo_guidance']) == 1

        # 5) Measurements — skipped, still must be recorded (this is the
        # signal computeRoomResumeTarget uses to know this step is behind us).
        res = sqlite_client.post('/area/measurements', json={
            'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Bedroom', 'room_key': 'bedroom',
            'unit': 'in', 'shelf_profiles': [], 'skipped': True,
        })
        assert res.status_code == 200, res.get_json()

        # 6) Recommendations — generate_area_recommendations + select_matching_products.
        mock_gemini.queue('Group everything by category and use bins for the top shelf. ' * 2)
        mock_gemini.queue('[]')  # no products matched, a valid/expected outcome
        res = sqlite_client.post('/area/recommendations', json={
            'session_id': session_id,
            'user_intention': 'Declutter and make it easy to use daily.',
        })
        rec_body = res.get_json()
        assert res.status_code == 200, rec_body
        assert 'bins' in rec_body['recommendations'].lower()
        assert rec_body['products'] == []

        # --- Now verify everything a deep resume needs is actually persisted ---
        project = _get_project(sqlite_client, session_id)
        room = project['rooms'][-1]
        assert room['room_key'] == 'bedroom'
        assert room['status'] == 'in_progress'
        assert [i['name'] for i in room['items']] == ['Closet']

        area = next(a for a in room['areas'] if a['name'] == 'Closet')
        assert area['context'].startswith('A closet')
        assert area['chat_path'] == 'mess_cleanup'
        assert area['chat_path_label'] == 'Mess Cleanup'
        assert len(area['follow_up_photo_guidance']) == 1
        assert 'bins' in area['recommendations'].lower()
        assert area['user_intention'] == 'Declutter and make it easy to use daily.'
        assert area['products'] == []

        assert project['measurements']['bedroom||Closet']['skipped'] is True

        chat_state = project['chat']['Closet']
        # Turn 1 (opening, no user_message yet) appends only the assistant's
        # reply; turn 2 appends the user's message then the assistant's —
        # three messages total, in that order.
        assert [m['role'] for m in chat_state['messages']] == ['assistant', 'user', 'assistant']
        assert chat_state['path_options'][0]['key'] == 'mess_cleanup'


class TestRoomStatusTransitions:
    def test_status_starts_in_progress_and_can_be_patched_by_room_key(self, sqlite_client, mock_gemini):
        session_id = _create_session(sqlite_client)
        mock_gemini.queue(json.dumps([{'name': 'Shelf', 'confidence': 80, 'reason': 'x'}]))
        _detect_items(sqlite_client, session_id, room_type='Living Room', room_key='living_room')

        project = _get_project(sqlite_client, session_id)
        assert project['rooms'][-1]['status'] == 'in_progress'

        # Mirrors the exact read-modify-write pattern frontend/api.js's
        # updateRoomStatus() uses: GET, edit the matching room by room_key,
        # PATCH the whole rooms array back.
        rooms = project['rooms']
        rooms[-1]['status'] = 'completed'
        res = sqlite_client.patch(f'/projects/{session_id}', json={'rooms': rooms})
        assert res.status_code == 200

        project = _get_project(sqlite_client, session_id)
        assert project['rooms'][-1]['status'] == 'completed'

    def test_discarded_room_is_not_the_in_progress_one(self, sqlite_client, mock_gemini):
        session_id = _create_session(sqlite_client)
        mock_gemini.queue(json.dumps([{'name': 'Shelf', 'confidence': 80, 'reason': 'x'}]))
        _detect_items(sqlite_client, session_id, room_type='Kitchen', room_key='kitchen')

        project = _get_project(sqlite_client, session_id)
        rooms = project['rooms']
        rooms[-1]['status'] = 'discarded'
        sqlite_client.patch(f'/projects/{session_id}', json={'rooms': rooms})

        project = _get_project(sqlite_client, session_id)
        in_progress = [r for r in project['rooms'] if r['room_key'] == 'kitchen' and r['status'] == 'in_progress']
        assert in_progress == []


class TestChatGuardrailAndQuestionCap:
    """Regression guard for a bug fixed earlier this session: a user who
    kept sending off-topic/guardrail-triggering messages never advanced
    question_count, so the MAX_CHAT_QUESTIONS cap never actually applied to
    that path and the chat had no forced end."""

    def test_guardrail_message_not_stored_but_still_counts_toward_hard_cap(self, sqlite_client, mock_gemini):
        session_id = _create_session(sqlite_client)
        mock_gemini.queue(json.dumps([{'name': 'Closet', 'confidence': 90, 'reason': 'x'}]))
        _detect_items(sqlite_client, session_id, room_type='Bedroom', room_key='bedroom')
        mock_gemini.queue(json.dumps({'question': 'Goal?', 'context': 'A closet.', 'additional_angles': []}))
        _analyze_area(sqlite_client, session_id)

        # Opening turn.
        mock_gemini.queue(json.dumps({'reply': 'Hi, what is the goal?', 'done': False, 'path_options': [], 'guardrail_triggered': False}))
        sqlite_client.post('/area/chat', json={'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Bedroom'})

        from app import MAX_CHAT_QUESTIONS

        last_body = None
        for _ in range(MAX_CHAT_QUESTIONS + 2):
            mock_gemini.queue(json.dumps({
                'reply': "Let's keep this about your closet.",
                'done': False,
                'path_options': [],
                'guardrail_triggered': True,
            }))
            res = sqlite_client.post('/area/chat', json={
                'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Bedroom',
                'user_message': 'totally unrelated message',
            })
            last_body = res.get_json()
            if last_body['done']:
                break

        assert last_body['done'] is True, 'hard cap never forced the chat to end despite every turn being a guardrail hit'
        assert last_body['path_options'], 'forced-done turn must still hand back path options so the user can proceed'


class TestChatJsonRetry:
    """Regression guard for the GENCONFIG_SHORT -> GENCONFIG_MEDIUM fix: a
    truncated/malformed JSON reply from the model used to surface a raw
    parser exception straight to the user ("Unterminated string...").
    run_natasha_chat_turn() now retries once before giving up."""

    def _start_chat(self, client, mock_gemini, session_id):
        mock_gemini.queue(json.dumps([{'name': 'Closet', 'confidence': 90, 'reason': 'x'}]))
        _detect_items(client, session_id, room_type='Bedroom', room_key='bedroom')
        mock_gemini.queue(json.dumps({'question': 'Goal?', 'context': 'A closet.', 'additional_angles': []}))
        _analyze_area(client, session_id)

    def test_malformed_first_reply_recovers_on_retry(self, sqlite_client, mock_gemini):
        session_id = _create_session(sqlite_client)
        self._start_chat(sqlite_client, mock_gemini, session_id)

        mock_gemini.queue('{"reply": "truncated mid-str')  # malformed — triggers the retry path
        mock_gemini.queue(json.dumps({'reply': 'Recovered on retry.', 'done': False, 'path_options': [], 'guardrail_triggered': False}))
        res = sqlite_client.post('/area/chat', json={'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Bedroom'})
        body = res.get_json()
        assert res.status_code == 200, body
        assert body['reply'] == 'Recovered on retry.'

    def test_malformed_both_attempts_gives_a_friendly_error_not_a_stack_trace(self, sqlite_client, mock_gemini):
        session_id = _create_session(sqlite_client)
        self._start_chat(sqlite_client, mock_gemini, session_id)

        mock_gemini.queue('{"reply": "still broken')
        mock_gemini.queue('{"also": "broken')
        res = sqlite_client.post('/area/chat', json={'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Bedroom'})
        body = res.get_json()
        assert res.status_code == 500
        assert 'Unterminated' not in body['error']
        assert 'try sending your message again' in body['error']


class TestMeasurementRoomKeyCollision:
    """Regression guard: measurements used to be keyed by area_name alone,
    so a 'Closet' in one room and a 'Closet' in a different room would
    silently overwrite each other's saved measurements."""

    def test_same_area_name_in_two_different_rooms_does_not_collide(self, sqlite_client, mock_gemini):
        session_id = _create_session(sqlite_client)

        mock_gemini.queue(json.dumps([{'name': 'Closet', 'confidence': 90, 'reason': 'x'}]))
        _detect_items(sqlite_client, session_id, room_type='Bedroom', room_key='bedroom')

        mock_gemini.queue(json.dumps([{'name': 'Closet', 'confidence': 85, 'reason': 'y'}]))
        _detect_items(sqlite_client, session_id, room_type='Guest Room', room_key='guest_room')

        res = sqlite_client.post('/area/measurements', json={
            'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Bedroom', 'room_key': 'bedroom',
            'unit': 'in', 'shelf_profiles': [{'count': 3, 'length': 20}], 'skipped': False,
        })
        assert res.status_code == 200, res.get_json()

        res = sqlite_client.post('/area/measurements', json={
            'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Guest Room', 'room_key': 'guest_room',
            'unit': 'in', 'shelf_profiles': [{'count': 5, 'length': 40}], 'skipped': False,
        })
        assert res.status_code == 200, res.get_json()

        project = _get_project(sqlite_client, session_id)
        measurements = project['measurements']
        assert measurements['bedroom||Closet']['shelf_profiles'][0]['count'] == 3
        assert measurements['guest_room||Closet']['shelf_profiles'][0]['count'] == 5

    def test_recommendations_pick_up_the_correct_rooms_measurement(self, sqlite_client, mock_gemini):
        session_id = _create_session(sqlite_client)

        mock_gemini.queue(json.dumps([{'name': 'Closet', 'confidence': 90, 'reason': 'x'}]))
        _detect_items(sqlite_client, session_id, room_type='Bedroom', room_key='bedroom')
        mock_gemini.queue(json.dumps([{'name': 'Closet', 'confidence': 85, 'reason': 'y'}]))
        _detect_items(sqlite_client, session_id, room_type='Guest Room', room_key='guest_room')

        # Only the guest room's Closet gets a real measurement saved.
        sqlite_client.post('/area/measurements', json={
            'session_id': session_id, 'area_name': 'Closet', 'room_type': 'Guest Room', 'room_key': 'guest_room',
            'unit': 'in', 'shelf_profiles': [{'count': 5, 'length': 40}], 'skipped': False,
        })

        # /area/recommendations requires an area entry to already exist for
        # the most recent room — the bedroom needs its Closet analyzed
        # first (the guest room, being the LAST detected room, is what
        # session['rooms'][-1] refers to otherwise).
        mock_gemini.queue(json.dumps([{'name': 'Closet', 'confidence': 90, 'reason': 'x'}]))
        _detect_items(sqlite_client, session_id, room_type='Bedroom', room_key='bedroom')
        mock_gemini.queue(json.dumps({'question': 'Goal?', 'context': 'A bedroom closet.', 'additional_angles': []}))
        _analyze_area(sqlite_client, session_id, area_name='Closet', room_type='Bedroom')

        # Bedroom's Closet never had measurements saved for it — its
        # recommendation request must NOT pick up the guest room's numbers.
        mock_gemini.queue('Group items by category on the bedroom closet shelves. ' * 2)
        mock_gemini.queue('[]')
        res = sqlite_client.post('/area/recommendations', json={
            'session_id': session_id, 'user_intention': 'Declutter the bedroom closet.',
        })
        assert res.status_code == 200, res.get_json()

        # generate_area_recommendations calls generate_content, then
        # select_matching_products calls it once more right after (the
        # '[]' response queued above) — the recommendation prompt is the
        # second-to-last call recorded.
        sent_prompt = mock_gemini.prompts[-2]
        sent_prompt = sent_prompt[0] if isinstance(sent_prompt, list) else sent_prompt
        assert 'No measurements were provided' in sent_prompt, (
            'bedroom Closet has no saved measurement — the prompt should say so explicitly'
        )
        assert '40' not in sent_prompt, (
            "the guest room's measurement (length 40) leaked into the bedroom's recommendation prompt"
        )
