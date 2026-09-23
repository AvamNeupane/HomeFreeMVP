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
