# Halfaya backend

Node.js/Express server that serves the frontend and accepts form submissions and user accounts.

## Run

1. Open a terminal in the `backend` folder
2. Install dependencies:

```bash
npm install
```

3. Create `backend/.env` (copy `.env.example`) and set the required secrets — see below.
4. Start the server:

```bash
npm start
```

The frontend is served at `http://localhost:3000`.

Run the tests with `npm test`.

## Data storage

Data is stored in a JSON file: `database/db.json` (users and form entries). The file is ignored by git. This is a temporary storage; the plan is to move to a real database.

## Environment variables

Required (the server exits at startup if they are missing, unless `NODE_ENV=development`):

- `JWT_SECRET` : secret used to sign login tokens. Use a long random value (32+ characters).
- `ADMIN_PASSWORD` : password for the admin panel (`/api/admin/login`). Use a strong, unique password.

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Recommended in production:

- `NODE_ENV=production` (this is also the behaviour when `NODE_ENV` is not set)
- `APP_URL` : public URL of the site, used in verification emails and as an allowed CORS origin.
- `FRONTEND_URL` : extra allowed CORS origin, if the frontend is hosted separately. If neither `APP_URL` nor `FRONTEND_URL` is set, cross-origin browser requests are refused in production.
- `TRUST_PROXY` : set to `1` (or the number of proxies) when running behind a reverse proxy such as Render or nginx, so that rate limiting uses the real client address.
- SMTP settings, required for registration in production: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`. Without them, registration is disabled in production.

Optional: `PORT` (default 3000), `SSL_KEY_PATH` and `SSL_CERT_PATH` to serve HTTPS directly.

## Local development

Set `NODE_ENV=development` in `backend/.env` for local work. In this mode:

- a missing `JWT_SECRET` or `ADMIN_PASSWORD` is replaced by a random value for that run (the generated admin password is printed in the console),
- registration works without SMTP and the response includes the verification token so you can test the flow.

Never use `NODE_ENV=development` on a public server.

## Account verification

New accounts must verify their email before they can log in. The verification link expires after 24 hours; use `/api/auth/resend` to get a new one. No login token is issued at registration.

## Rate limits

Per client address: login 10 / 15 min, admin login 5 / 15 min, registration 5 / hour, resend 5 / hour, public forms 30 / 15 min. Limits are kept in memory (single process).

## HTTPS for local testing

Generating a self-signed certificate (Git Bash or WSL with OpenSSL):

```bash
mkdir -p backend/certs
openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 365 \
	-keyout backend/certs/localhost.key -out backend/certs/localhost.crt \
	-subj "/CN=localhost"
```

Then set `SSL_KEY_PATH` and `SSL_CERT_PATH` in `.env` to `backend/certs/localhost.key` and `backend/certs/localhost.crt`.

## Secrets and git

`backend/.env` and `database/db.json` are listed in `.gitignore`. Never commit real secrets. If a secret was ever committed, change it — removing the file later does not remove it from git history.
