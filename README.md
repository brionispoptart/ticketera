## PWA Support

Ticketera now exposes a Progressive Web App manifest, install icons, and a lightweight service worker.

- Installability requires HTTPS in normal mobile browsers.
- Local desktop testing can still use `localhost`.
- On deployed environments, use the existing Caddy HTTPS setup so browsers will allow install prompts.

# Ticketera (Next.js + shadcn/ui-ready)

This project has been re-initialized to Next.js App Router with TypeScript and Tailwind CSS.

## Why this stack

- Next.js is the most common React framework for production web apps.
- shadcn/ui has first-class support for Next.js and App Router.
- API calls now run server-side via Next route handlers so your Atera API key is not shipped to the browser.

## Quick start

1. Install Node.js 22 LTS (or newer).
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create env file:

   - Recommended: copy `.env.example` to `.env.local`
   - Set `APP_CONFIG_ENCRYPTION_KEY` to a long random secret for encrypting stored app settings
   - `ATERA_API_KEY` is optional if you want to use the in-app first-run setup flow
   - Optional for comment creation: set `ATERA_TECHNICIAN_ID=...`

4. Run dev server:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000

6. If this is a brand-new database, complete the first-run owner setup flow:

   - Open `/setup`
   - Create the first admin account
   - Save the Atera API key through the setup form

The Atera key entered through setup or admin settings is encrypted before it is stored in the application database. The encryption secret comes from `APP_CONFIG_ENCRYPTION_KEY`.

## Phase 1: Docker-Ready Auth Foundation

Phase 1 adds a production-oriented authentication data model and bootstrap tooling without forcing login yet.

### What is included

- SQLite-first Prisma setup with optional PostgreSQL mode
- Admin bootstrap script (creates first admin only when none exists)
- Auth diagnostics script for quick troubleshooting
- API health endpoint: `/api/health/auth`
- Docker compose stack (`app` + `db`)

### User fields in database

- `avatarUrl`
- `firstName`
- `lastName`
- `employeeId`
- `technicianLevel`
- `email`
- `passwordHash`
- `role` (`ADMIN` or `TECHNICIAN`)
- `isActive`, `mustChangePassword`, timestamps

### Database modes

- Default: `sqlite`
- Optional: `postgresql`

Set `DATABASE_PROVIDER=sqlite` for the simplest local setup.
Set `DATABASE_PROVIDER=postgresql` and provide `POSTGRES_DATABASE_URL` when you want a server-grade database.

### Local Phase 1 setup

1. Copy `.env.example` to `.env.local` and fill values.
2. Choose a database mode:

   - SQLite: no separate database service required
   - PostgreSQL: start PostgreSQL locally or in Docker and set `POSTGRES_DATABASE_URL`

3. Generate Prisma client:

   ```bash
   npm run db:generate
   ```

4. Apply schema:

   ```bash
   npm run db:push
   ```

5. Complete first-run setup in the browser at `/setup`.

   Optional fallback: use `npm run auth:bootstrap` only if you explicitly want CLI bootstrap behavior.

6. Run diagnostics:

   ```bash
   npm run auth:doctor
   ```

### Docker setup

1. Start the app only:

   ```bash
   docker compose up --build
   ```

   This runs Ticketera standalone on port `4217` with SQLite as the default database.
   Caddy is not included in this default command and only starts if you add `-f docker-compose.caddy.yml`.
   No `.env` file is required for this default path.

3. Optional: add Caddy reverse proxy:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.caddy.yml up --build
   ```

   For Caddy, set:

   - `APP_DOMAIN`: the DNS name users will open in the browser
   - `TLS_EMAIL`: certificate contact email for Let's Encrypt in production

4. Optional: run with PostgreSQL instead:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build
   ```

5. Optional: use both Caddy and PostgreSQL:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.caddy.yml -f docker-compose.postgres.yml up --build
   ```

6. Check auth health:

   - Standalone: `http://localhost:4217/api/health/auth`
   - With Caddy: `https://your-domain/api/health/auth`

### Simple Docker Hub compose

For a minimal pull-and-run setup from Docker Hub, use:

```bash
docker compose -f docker-compose.simple.yml up -d
```

This file runs app-only mode with a persisted SQLite volume and the same setup-first defaults.
No `.env` file is required unless you want to override defaults such as `APP_IMAGE_TAG`, `APP_PORT`, or `APP_CONFIG_ENCRYPTION_KEY`.

Environment guidance for the simplified app-only default:

- Optional overrides only: `APP_CONFIG_ENCRYPTION_KEY`, `DATABASE_PROVIDER`, and database URL values (`SQLITE_DATABASE_URL` or `POSTGRES_DATABASE_URL`).
- Optional in deployment env: Atera fallback values (`ATERA_API_KEY`, `ATERA_API_BASE`, `ATERA_TECHNICIAN_ID`) and auth tuning values.
- Managed by first-run setup flow: initial admin account and stored Atera API key.
- Base app-only Docker defaults initialize a fresh SQLite database automatically on first boot.
- Base app-only Docker defaults keep `AUTH_COOKIE_SECURE=false` so login works over direct HTTP access.
- When running behind HTTPS (for example with Caddy), set `AUTH_COOKIE_SECURE=true`.
- Change `APP_CONFIG_ENCRYPTION_KEY` for any real deployment. The baked-in image default exists only to remove first-run friction.

Why database selection is not part of first-run setup:

- The app must connect to a database before the setup page can load.
- Because of that, choosing SQLite vs PostgreSQL stays a deployment-time decision.

### Production Docker profile

For production-style runtime defaults (resource limits, log rotation, and no automatic schema push on each boot), use the production override file:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

If running with PostgreSQL in production:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.postgres.yml up --build -d
```

If running with Caddy in production:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml up --build -d
```

If running with both Caddy and PostgreSQL in production:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml -f docker-compose.postgres.yml up --build -d
```

Production compose expects app images from `${APP_IMAGE_REPO}:${APP_IMAGE_TAG}`.
Default repo is `brionispoptart/ticketera`.

The first-run setup flow can collect the Atera API key and initial admin account because those are stored after the app is already running. Database provider selection is different: the app needs a working database before the setup flow can even load, so switching from SQLite to PostgreSQL remains a deployment-time choice.

By default, `RUN_DB_PUSH_ON_START=false` in production. This prevents unplanned schema mutations on every container restart.

If you need a controlled schema push window (for first boot or planned migration), run one deployment with:

```bash
RUN_DB_PUSH_ON_START=true docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Then return it to `false` for normal operation.

### One-command production deploy

Use the deployment script to standardize production updates:

```bash
./scripts/deploy-prod.sh
```

Recommended release tagging pattern:

```bash
./scripts/deploy-prod.sh --image-tag 2026.03.27.1
```

Using explicit tags is the preferred production practice because you can redeploy known-good images quickly.

Common options:

```bash
# Deploy with PostgreSQL profile
./scripts/deploy-prod.sh --postgres

# Deploy with optional Caddy
./scripts/deploy-prod.sh --caddy

# Deploy from a specific image repository
./scripts/deploy-prod.sh --image-repo brionispoptart/ticketera

# Deploy with a controlled schema push window
./scripts/deploy-prod.sh --run-db-push

# Deploy without rebuilding images
./scripts/deploy-prod.sh --skip-build

# Deploy with an explicit image tag
./scripts/deploy-prod.sh --image-tag 2026.03.27.1
```

The script will:

- verify `.env` exists
- update local checkout to `origin/main` (unless `--skip-git` is used)
- run Docker Compose with `docker-compose.yml` + `docker-compose.prod.yml`
- print resulting container status

### One-command tagged release

Use the release helper to generate a UTC timestamp tag automatically and deploy it:

```bash
./scripts/release-prod.sh
```

Examples:

```bash
# Force a custom tag
./scripts/release-prod.sh --tag 2026.03.27.1

# Release with postgres profile
./scripts/release-prod.sh --postgres

# Release with Caddy enabled
./scripts/release-prod.sh --caddy

# Release with explicit image repo
./scripts/release-prod.sh --image-repo brionispoptart/ticketera
```

This helper wraps `deploy-prod.sh --image-tag <tag>` so each release is reproducible and rollback-friendly.

### Minimal Docker Hub deploy

For the simplest pull-and-run deployment from Docker Hub, use the minimal compose file:

```bash
docker compose -f docker-compose.simple.yml up -d
```

This file:

- pulls `brionispoptart/ticketera:${APP_IMAGE_TAG:-latest}`
- uses SQLite by default
- persists app data in a named Docker volume
- exposes the app on port `4217`
- keeps `AUTH_COOKIE_SECURE=false` for direct HTTP access

If you want a pinned image version instead of `latest`, set `APP_IMAGE_TAG` in `.env` first.

### Rollback to a prior release

Use the rollback script to redeploy a previously built image tag:

```bash
./scripts/deploy-rollback.sh --to-tag 2026.03.27.1
```

With PostgreSQL profile:

```bash
./scripts/deploy-rollback.sh --to-tag 2026.03.27.1 --postgres
```

With Caddy enabled:

```bash
./scripts/deploy-rollback.sh --to-tag 2026.03.27.1 --caddy
```

With explicit image repo:

```bash
./scripts/deploy-rollback.sh --to-tag 2026.03.27.1 --image-repo brionispoptart/ticketera
```

Rollback runs with `--no-build` and `RUN_DB_PUSH_ON_START=false` to avoid accidental schema changes during recovery.

For local-only testing with `APP_DOMAIN=localhost`, Caddy can serve HTTPS, but browsers may warn because the container's local CA is not automatically trusted by the host OS. For a clean browser-trusted certificate, use a real DNS name that points at the server.

When you use the Caddy overlay, users should access Ticketera through Caddy on ports `80/443` instead of the app port.

If bootstrap auto-generates a password, it is printed in container logs once and the account is forced to change password on first login (Phase 2).

Current default behavior is to start with no admin account and redirect first-run owners to `/setup` so they can create the initial admin and save the Atera API key interactively.

The auth health endpoint reports the active database provider so configuration mistakes are easier to spot quickly.

### Production verification

Before shipping a build, run:

```bash
npm run prod:check
```

This verifies:

- ESLint passes with the supported ESLint CLI
- the Next.js production build succeeds
- auth/database diagnostics succeed for the active environment

Container deployments also expose `/api/health/auth` as a Docker healthcheck target.

## Phase 2: Login and Session Access Control

Phase 2 adds technician sign-in, password rotation, and protected ticket routes.

### What is included

- `/login` technician sign-in page
- `/change-password` forced rotation flow for temporary passwords
- Session-backed auth using database stored session records
- Protected dashboard page and protected `/api/tickets/*` routes
- Auth endpoints:
   - `/api/auth/login`
   - `/api/auth/logout`
   - `/api/auth/me`
   - `/api/auth/change-password`

### Validation tips

- Use `/api/health/auth` to confirm database, user table, and session table status.
- Use `npm run auth:doctor` for CLI diagnostics.
- If sign-in succeeds but dashboard access fails, clear cookies and sign in again.

## Phase 3: Admin User Management

Phase 3 adds admin-only user provisioning and access-control management.

### What is included

- Admin page at `/admin/users`
- Admin-only APIs:
   - `/api/admin/users`
   - `/api/admin/users/[id]`
   - `/api/admin/users/[id]/reset-password`
- Create user flow with one-time temporary password output
- Edit user details and activate/deactivate access
- Reset password flow that revokes existing sessions and forces password rotation

### Current guardrails

- Users cannot self-register
- Technicians cannot alter their own profile or access fields
- Admin self-edit and admin self-reset are blocked from the admin panel path to reduce lockout risk

### Admin integration settings

- Admin settings page at `/admin/settings`
- Stored Atera API key rotation without editing `.env`
- Stored key is encrypted at rest using `APP_CONFIG_ENCRYPTION_KEY`

## Phase 4: Lockout Protection and Audit Visibility

Phase 4 adds failed-login lockout protection and an admin audit feed.

### What is included

- Account lockout after repeated failed login attempts
- Admin audit log API at `/api/admin/audit-logs`
- Audit feed embedded in the admin user-management page
- Smoke test for lockout behavior: `npm run auth:smoke-lockout`

### Lockout configuration

- `AUTH_MAX_FAILED_LOGIN_ATTEMPTS`
- `AUTH_LOCKOUT_MINUTES`

Admins can clear lockout state by resetting a user's password or re-saving an active user profile in the admin panel.

## Project structure

- `src/app/page.tsx`: main ticket UI
- `src/app/api/tickets/route.ts`: list tickets
- `src/app/api/tickets/[id]/comments/route.ts`: add internal comment
- `src/app/api/tickets/[id]/resolve/route.ts`: resolve ticket (optional note first)
- `components.json`: shadcn/ui config
