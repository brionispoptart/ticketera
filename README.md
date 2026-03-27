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

1. Create `.env` from `.env.example`.
2. Set the public host values used for HTTPS:

   - `APP_DOMAIN`: the DNS name users will open in the browser
   - `TLS_EMAIL`: certificate contact email for Let's Encrypt in production

   Example:

   ```env
   APP_DOMAIN=ticketera.example.com
   TLS_EMAIL=admin@example.com
   ```

3. Start services:

   ```bash
   docker compose up --build
   ```

   This starts Caddy in front of the app. Public traffic enters through ports `80` and `443` and is reverse-proxied to the internal app container over the Docker network. SQLite remains the default database.

4. Optional: run with PostgreSQL instead:

   ```bash
   docker compose --profile postgres up --build
   ```

5. Check auth health:

   - `https://your-domain/api/health/auth`

For local-only testing with `APP_DOMAIN=localhost`, Caddy can serve HTTPS, but browsers may warn because the container's local CA is not automatically trusted by the host OS. For a clean browser-trusted certificate, use a real DNS name that points at the server.

The Next.js app container is no longer published directly on port `3000`; it is exposed only to the internal Docker network behind Caddy.

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
