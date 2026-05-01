# Halfaya backend

Run the simple Node.js server which serves the frontend and accepts POST submissions.

Steps:

1. Open terminal in `backend` folder
2. Install dependencies:

```bash
npm install
```

3. Start server:

```bash
npm start
```

The frontend will be available at `http://localhost:3000` and form submissions are saved as newline-delimited JSON files in the `database` folder (e.g. `database/inquiry.json`).

Environment variables (optional but recommended):

- `JWT_SECRET` : secret to sign JWT tokens (change in production).
- `APP_URL` : public URL used in verification emails (defaults to `http://localhost:3000`).
- SMTP settings to enable email verification:
	- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`.
- `ADMIN_PASSWORD` : set an admin password to use the admin API (`/api/admin/login`).

Default admin password (for local testing): `5al3D647+` (change this in production).

To override, set the environment variable `ADMIN_PASSWORD` before starting the server, for example on Windows PowerShell:

```powershell
setx ADMIN_PASSWORD "your_strong_password"
```

Using a `.env` file (recommended for local development)

1. Create a file named `.env` in the `backend` folder with contents like:

```
JWT_SECRET=some-very-strong-random-string
ADMIN_PASSWORD=your_admin_password
APP_URL=http://localhost:3000
# Optional for SMTP
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=...
# SMTP_PASS=...
# FROM_EMAIL=...

# Optional: enable HTTPS by providing paths to key and cert files
# SSL_KEY_PATH=./certs/localhost.key
# SSL_CERT_PATH=./certs/localhost.crt
```

2. Install `dotenv` (already included in `package.json`) and start the server normally. The server will load `.env` automatically.

Generating a self-signed certificate (for local HTTPS testing)

On Windows with OpenSSL installed (Git Bash or WSL), run:

```bash
mkdir -p backend/certs
openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 365 \
	-keyout backend/certs/localhost.key -out backend/certs/localhost.crt \
	-subj "/CN=localhost"
```

Then set `SSL_KEY_PATH` and `SSL_CERT_PATH` in `.env` to `backend/certs/localhost.key` and `backend/certs/localhost.crt`.

Git / commit note

I added a `.gitignore` file at the repository root to ignore `backend/.env`, `database/db.json`, and `node_modules/`.
Please commit the `.gitignore` to the repository so the sensitive files are not accidentally included in commits. Example commands:

```bash
git add .gitignore
git commit -m "Add .gitignore to exclude .env and DB files"
git push
```

If you already committed sensitive files earlier, remove them from the repo history or at least from the index before pushing:

```bash
git rm --cached backend/.env
git rm --cached database/db.json
git commit -m "Remove sensitive files from index"
```



When SMTP is not configured, the server will return a `verifyToken` in the registration response for testing.

New storage: data is stored in SQLite at `database/halfaya.db`. Use `sqlite3` or any DB browser to inspect.
