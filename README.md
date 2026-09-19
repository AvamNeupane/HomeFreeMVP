# Setup & Run

Two terminals: one for the backend (Flask + Postgres/Gemini), one for the frontend (Expo).

## 1. Railway Postgres — one-time setup

1. Go to [railway.app](https://railway.app) and open (or create) your project.
2. Click **New → Database → PostgreSQL**.
3. Open the new Postgres service → **Connect** tab → copy the **Public Network** connection string (it looks like `postgresql://postgres:...@viaduct.proxy.rlwy.net:PORT/railway`).
   - **Do not** use the *internal* string (host ending in `.railway.internal`) for local development — that hostname only resolves from other services running inside Railway's own network, not from your laptop. Using it locally will fail to connect.
4. Paste that public connection string into `backend/.env` as `DATABASE_URL` (see below).

If `DATABASE_URL` is left unset, the backend still runs — it just falls back to a local SQLite file with no login/accounts (useful for quick testing without the DB).

## 2. Backend

```bash
cd backend
python -m venv venv          # first time only
source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create/edit `backend/.env`:

```
GEMINI_API_KEY=your_gemini_api_key
ALLOWED_ORIGINS=*
DATABASE_URL=postgresql://...   # public Railway connection string — see above
JWT_SECRET=some-long-random-string
PORT=5001

# Captcha (see "Cloudflare Turnstile" below) — optional; signup/login
# skip captcha verification with a warning if this is left unset.
TURNSTILE_SECRET_KEY=your_turnstile_secret_key

# Email report delivery (see "Gmail App Password" below) — optional;
# /report/email returns an error if these aren't set.
SMTP_EMAIL=youraccount@gmail.com
SMTP_APP_PASSWORD=your_16_char_app_password
```

Run it:

```bash
python app.py
```

You should see a startup banner printing the local network URL — that's what goes into the frontend's `.env` next. Leave this terminal running.

## 3. Frontend

In a **second terminal**:

```bash
cd frontend
npm install
```

Edit `frontend/.env`:

```
EXPO_PUBLIC_API_BASE_URL=http://<your-computer-LAN-IP>:5001
EXPO_PUBLIC_TURNSTILE_SITE_KEY=your_turnstile_site_key   # see "Cloudflare Turnstile" below
```

Find your LAN IP with `ipconfig getifaddr en0` (Mac) or `ipconfig` (Windows). This has to be your computer's actual network IP, not `localhost`, if you're testing on a physical phone via Expo Go — `localhost` on a phone points at the phone itself.

Start the app:

```bash
npx expo start
```

Scan the QR code with Expo Go (phone) or press `i`/`a` for a simulator/emulator. Make sure your phone and computer are on the same WiFi network.

## 4. Cloudflare Turnstile (captcha) — one-time setup

Signup and login both run an invisible/managed Turnstile check before submitting. Most real users never see anything — Cloudflare only shows a checkbox if it can't score the request with confidence.

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** (free, no domain required to get started — you can register `localhost`/a placeholder while developing).
2. Add a site, choose **Managed** widget mode.
3. Copy the **Site Key** into `frontend/.env` as `EXPO_PUBLIC_TURNSTILE_SITE_KEY` (public by design — this is meant to ship in the app).
4. Copy the **Secret Key** into `backend/.env` as `TURNSTILE_SECRET_KEY` (keep this one private).

If `TURNSTILE_SECRET_KEY` is left unset, the backend logs a warning and skips verification — useful for local dev before you've set up a Cloudflare account, but do not ship a build without it configured.

**Local dev domain limitation:** the captcha page runs inside a WebView loaded from raw HTML (`components/CaptchaChallenge.js`), which has no real hostname — Cloudflare validates the widget against whatever domain(s) you registered for the site (e.g. `localhost`), and an inline HTML blob doesn't match that or any other domain, so a real site key will fail immediately with a Cloudflare error (`110200` = "domain not allowed") during local development no matter what you register. Both `.env` files currently hold Cloudflare's official published **test key pair** instead (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA` — "always passes," works on any domain, documented at [developers.cloudflare.com/turnstile/troubleshooting/testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)), with the real key/secret commented out alongside them. Swap back to the real pair once the app either (a) ships with a real production domain to register, or (b) the captcha page gets served from an actual backend route instead of inline HTML — the domain-validation problem doesn't fully go away otherwise.

## 5. Gmail App Password (email reports) — one-time setup

The "Email Report" button on the final report sends the PDF via plain Gmail SMTP. Gmail requires a dedicated **App Password**, not your normal account password, and only issues one once 2-Step Verification is on.

1. Turn on 2-Step Verification on the Gmail account you want to send from: [myaccount.google.com/security](https://myaccount.google.com/security).
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create an app password (name it something like "Home Free Organizing").
3. Put the sending address and the 16-character app password into `backend/.env` as `SMTP_EMAIL` and `SMTP_APP_PASSWORD`.

Note: Gmail SMTP caps free accounts around 500 sends/day and has no SPF/DKIM alignment for a custom domain, so some recipients' spam filters may catch it — acceptable for now, flagged in `OVERVIEW.md` as a future upgrade path if delivery becomes unreliable.

## Troubleshooting

- **"Cannot connect to backend"** — confirm `python app.py` is still running in the first terminal and `EXPO_PUBLIC_API_BASE_URL` matches its printed LAN IP exactly.
- **Postgres connection fails locally** — you're likely using the `.railway.internal` hostname; swap in the Public Network string from Railway's Connect tab.
- **Login/signup returns 503** — `DATABASE_URL` isn't set or couldn't connect; accounts require Postgres.
- **Signup/login says captcha verification failed** — double check `TURNSTILE_SECRET_KEY` (backend) and `EXPO_PUBLIC_TURNSTILE_SITE_KEY` (frontend) belong to the *same* Turnstile site in Cloudflare's dashboard.
- **"Email sending is not configured on this server"** — `SMTP_EMAIL`/`SMTP_APP_PASSWORD` aren't set in `backend/.env`; see the Gmail App Password section above.

See `OVERVIEW.md` for what the app does, what changed in this sprint, and what's still TBD.
