"""Per-user project listing and ownership checks — also needs real Postgres
since projects are only user-scoped when USING_POSTGRES (see pg_client)."""


def _signup_and_token(client, email):
    body = client.post('/auth/signup', json={'email': email, 'password': 'a long enough password'}).get_json()
    return body['token']


def _create_project(client, token):
    res = client.post('/session/create', headers={'Authorization': f'Bearer {token}'})
    return res.get_json()['session_id']


class TestSessionCreateRequiresAuth:
    def test_valid_token_creates_a_project(self, pg_client):
        token = _signup_and_token(pg_client, 'creator@example.com')
        session_id = _create_project(pg_client, token)
        assert session_id

    def test_invalid_token_is_still_rejected(self, pg_client):
        # A present-but-garbage token must still 401 — only a genuinely
        # ABSENT Authorization header means "guest" (see the next class).
        res = pg_client.post('/session/create', headers={'Authorization': 'Bearer not-a-real-token'})
        assert res.status_code == 401


class TestGuestSessionCreate:
    """No Authorization header at all → an anonymous Guest Mode project,
    even with accounts enabled (USING_POSTGRES) — see /session/create's
    docstring for the reasoning."""

    def test_no_token_creates_an_anonymous_project(self, pg_client):
        res = pg_client.post('/session/create')
        body = res.get_json()
        assert res.status_code == 200, body
        assert body['session_id']

    def test_guest_project_is_not_owned_by_anyone(self, pg_client):
        session_id = pg_client.post('/session/create').get_json()['session_id']
        res = pg_client.get(f'/projects/{session_id}')
        assert res.status_code == 200, res.get_json()

    def test_guest_project_does_not_appear_in_any_users_project_list(self, pg_client):
        session_id = pg_client.post('/session/create').get_json()['session_id']
        token = _signup_and_token(pg_client, 'real-user@example.com')
        res = pg_client.get('/projects', headers={'Authorization': f'Bearer {token}'})
        ids = [p['id'] for p in res.get_json()['projects']]
        assert session_id not in ids


class TestProjectListing:
    def test_lists_only_this_users_projects_most_recently_updated_first(self, pg_client):
        token_a = _signup_and_token(pg_client, 'owner-a@example.com')
        token_b = _signup_and_token(pg_client, 'owner-b@example.com')

        project_1 = _create_project(pg_client, token_a)
        project_2 = _create_project(pg_client, token_a)
        _create_project(pg_client, token_b)  # a different user's project — must never appear for A

        # Touch project_1 after project_2 was created so ordering is
        # deterministic regardless of how fast both creates landed.
        pg_client.patch(f'/projects/{project_1}', json={'project_name': 'Touched'},
                         headers={'Authorization': f'Bearer {token_a}'})

        res = pg_client.get('/projects', headers={'Authorization': f'Bearer {token_a}'})
        body = res.get_json()
        assert res.status_code == 200
        ids = [p['id'] for p in body['projects']]
        assert set(ids) == {project_1, project_2}
        assert ids[0] == project_1  # most recently updated first


class TestProjectOwnership:
    def test_owner_can_read_and_patch_their_own_project(self, pg_client):
        token = _signup_and_token(pg_client, 'sole-owner@example.com')
        project_id = _create_project(pg_client, token)
        headers = {'Authorization': f'Bearer {token}'}

        res = pg_client.get(f'/projects/{project_id}', headers=headers)
        assert res.status_code == 200

        res = pg_client.patch(f'/projects/{project_id}', json={'project_name': 'Mine'}, headers=headers)
        assert res.status_code == 200

    def test_a_different_user_cannot_read_or_patch_it(self, pg_client):
        owner_token = _signup_and_token(pg_client, 'owner@example.com')
        project_id = _create_project(pg_client, owner_token)

        other_token = _signup_and_token(pg_client, 'someone-else@example.com')
        other_headers = {'Authorization': f'Bearer {other_token}'}

        res = pg_client.get(f'/projects/{project_id}', headers=other_headers)
        assert res.status_code == 403

        res = pg_client.patch(f'/projects/{project_id}', json={'project_name': 'Hijacked'}, headers=other_headers)
        assert res.status_code == 403


class TestProjectDeletion:
    """Hard delete, owner-scoped — see DELETE /projects/<id> in app.py."""

    def test_owner_can_delete_their_own_project(self, pg_client):
        token = _signup_and_token(pg_client, 'deleter@example.com')
        project_id = _create_project(pg_client, token)
        headers = {'Authorization': f'Bearer {token}'}

        res = pg_client.delete(f'/projects/{project_id}', headers=headers)
        assert res.status_code == 200, res.get_json()

        # Gone for real, not flagged — it neither reads back nor lists.
        assert pg_client.get(f'/projects/{project_id}', headers=headers).status_code == 404
        ids = [p['id'] for p in pg_client.get('/projects', headers=headers).get_json()['projects']]
        assert project_id not in ids

    def test_a_different_user_cannot_delete_it(self, pg_client):
        owner_token = _signup_and_token(pg_client, 'delete-owner@example.com')
        project_id = _create_project(pg_client, owner_token)

        other_token = _signup_and_token(pg_client, 'delete-thief@example.com')
        res = pg_client.delete(f'/projects/{project_id}', headers={'Authorization': f'Bearer {other_token}'})
        assert res.status_code == 404

        # Still very much the owner's.
        owner_headers = {'Authorization': f'Bearer {owner_token}'}
        assert pg_client.get(f'/projects/{project_id}', headers=owner_headers).status_code == 200

    def test_delete_requires_a_token(self, pg_client):
        token = _signup_and_token(pg_client, 'anon-delete@example.com')
        project_id = _create_project(pg_client, token)
        assert pg_client.delete(f'/projects/{project_id}').status_code == 401


class TestCleanupNeverDeletesOwnedProjects:
    """
    Regression test for a silent data-loss bug: cleanup_old_sessions() used
    to delete EVERY project past a 1-hour TTL with no owner check, and runs
    on every /health call — so a logged-in user's saved projects vanished
    about an hour after they were created. Accounts exist so projects
    persist; only anonymous guest projects may ever expire.
    """

    def test_owned_project_survives_cleanup_but_guest_project_does_not(self, pg_app, pg_client):
        token = _signup_and_token(pg_client, 'persists@example.com')
        owned_id = _create_project(pg_client, token)
        guest_id = pg_client.post('/session/create').get_json()['session_id']

        # TTL of 0 makes everything already-expired, so this asserts the
        # owner check itself rather than waiting out a real clock.
        pg_app.GUEST_SESSION_TIMEOUT = 0
        pg_app.cleanup_old_sessions()

        headers = {'Authorization': f'Bearer {token}'}
        assert pg_client.get(f'/projects/{owned_id}', headers=headers).status_code == 200
        assert pg_client.get(f'/projects/{guest_id}').status_code == 404

    def test_health_check_does_not_wipe_saved_projects(self, pg_app, pg_client):
        # /health calls cleanup on every request and the app hits it at
        # startup, which is what made the original bug so destructive.
        token = _signup_and_token(pg_client, 'health-safe@example.com')
        project_id = _create_project(pg_client, token)

        pg_app.GUEST_SESSION_TIMEOUT = 0
        assert pg_client.get('/health').status_code == 200

        headers = {'Authorization': f'Bearer {token}'}
        assert pg_client.get(f'/projects/{project_id}', headers=headers).status_code == 200
