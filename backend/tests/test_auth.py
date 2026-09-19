"""
Auth/account tests — these need real Postgres (accounts are gated behind
USING_POSTGRES), so they use the pg_client fixture, which spins up a
throwaway local Postgres cluster (see conftest.py's postgres_dsn) and skips
cleanly if no local Postgres install is found.
"""

from datetime import datetime, timedelta

import jwt


def _signup(client, email='new.user@example.com', password='correct horse battery'):
    return client.post('/auth/signup', json={'email': email, 'password': password})


class TestSignupAndLogin:
    def test_signup_then_me_with_returned_token(self, pg_client):
        res = _signup(pg_client)
        body = res.get_json()
        assert res.status_code == 201, body
        assert body['user']['email'] == 'new.user@example.com'
        assert body['user']['liability_accepted'] is False

        me = pg_client.get('/auth/me', headers={'Authorization': f"Bearer {body['token']}"})
        me_body = me.get_json()
        assert me.status_code == 200
        assert me_body['user']['email'] == 'new.user@example.com'

    def test_duplicate_email_is_rejected(self, pg_client):
        _signup(pg_client, email='dupe@example.com')
        res = _signup(pg_client, email='dupe@example.com')
        assert res.status_code == 409

    def test_login_with_wrong_password_is_rejected(self, pg_client):
        _signup(pg_client, email='real@example.com', password='the real password')
        res = pg_client.post('/auth/login', json={'email': 'real@example.com', 'password': 'wrong password'})
        assert res.status_code == 401

    def test_login_with_correct_password_succeeds(self, pg_client):
        _signup(pg_client, email='real2@example.com', password='the real password')
        res = pg_client.post('/auth/login', json={'email': 'real2@example.com', 'password': 'the real password'})
        body = res.get_json()
        assert res.status_code == 200
        assert body['user']['email'] == 'real2@example.com'
        assert 'liability_accepted' in body['user']


class TestTokenValidation:
    def test_missing_auth_header_is_rejected(self, pg_client):
        res = pg_client.get('/auth/me')
        assert res.status_code == 401

    def test_garbage_token_is_rejected(self, pg_client):
        res = pg_client.get('/auth/me', headers={'Authorization': 'Bearer not-a-real-token'})
        assert res.status_code == 401

    def test_expired_token_is_rejected(self, pg_client, pg_app):
        expired = jwt.encode(
            {'user_id': 'whoever', 'exp': datetime.utcnow() - timedelta(days=1), 'iat': datetime.utcnow() - timedelta(days=31)},
            pg_app.JWT_SECRET, algorithm='HS256',
        )
        res = pg_client.get('/auth/me', headers={'Authorization': f'Bearer {expired}'})
        assert res.status_code == 401

    def test_token_signed_with_a_different_secret_is_rejected(self, pg_client):
        forged = jwt.encode(
            {'user_id': 'whoever', 'exp': datetime.utcnow() + timedelta(days=1)},
            'a-completely-different-secret', algorithm='HS256',
        )
        res = pg_client.get('/auth/me', headers={'Authorization': f'Bearer {forged}'})
        assert res.status_code == 401


class TestLiabilityGate:
    def test_new_account_has_not_accepted_liability(self, pg_client):
        res = _signup(pg_client, email='liability1@example.com')
        assert res.get_json()['user']['liability_accepted'] is False

    def test_accept_liability_flips_it_and_is_idempotent(self, pg_client):
        signup_body = _signup(pg_client, email='liability2@example.com').get_json()
        token = signup_body['token']
        headers = {'Authorization': f'Bearer {token}'}

        res = pg_client.post('/auth/accept-liability', headers=headers)
        assert res.status_code == 200

        me = pg_client.get('/auth/me', headers=headers).get_json()
        assert me['user']['liability_accepted'] is True

        # Calling it again must not error or un-accept it.
        res2 = pg_client.post('/auth/accept-liability', headers=headers)
        assert res2.status_code == 200
        me2 = pg_client.get('/auth/me', headers=headers).get_json()
        assert me2['user']['liability_accepted'] is True
