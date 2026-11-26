# OpenPwd

Shared password vault for a non-profit running on Google Workspace. Members sign in with their
Workspace account, see the passwords of the organizations they belong to, and every reveal or
copy is recorded.

SvelteKit + TypeScript, Supabase (Postgres, Auth), Google Cloud KMS.

## Security model

- **Sign-in**: Google only, restricted to one Workspace domain. No password, no second secret.
- **Encryption**: every secret is encrypted by Google Cloud KMS. The server holds no key. It
  asks KMS to decrypt **as the signed-in member**, with that member's own Google access token,
  so Google decides who may decrypt (IAM on the key, normally granted to a Google group).
- **Audit**: a ciphertext leaves the database only through `reveal_entry()`, which writes the
  audit row in the same transaction. The `audit_log` table is append-only.
- **Database**: the browser never talks to Supabase. The server acts as the member, so
  row-level security applies to every query, and API roles can only read: all writes go
  through audited SQL functions.
- **Sessions**: the database only honours a token whose session still exists, was opened
  through Google, and is younger than `max_session_minutes` (2 hours by default). Signing out cuts access at once, and an
  account removed from the Workspace loses everything within that window, because it can no
  longer pass the hourly Google sign-in that creates a fresh session.

What this does **not** protect against:

- A compromised application server can capture the secrets members open while the attacker is
  present, and can use a member's Google token until it expires (one hour). It cannot decrypt
  the database on its own.
- A hijacked Google account sees what that member could see. Enforce 2-step verification in
  the Workspace admin console.
- The audit log proves that an entry's secrets were released to a member, not which field
  they looked at: the field named in a log line is what the app asked for, and a member
  calling the API directly could ask for the whole entry under any label.
- Anyone with direct database ownership can disable the audit trigger. Cloud KMS Data Access
  logs are the independent record of decryptions.

## Local development

Needs Bun, Docker and the Supabase CLI.

```bash
bun install
supabase start
cp .env.example .env
bun run dev
```

Fill `.env` from `supabase status` (publishable key), `openssl rand -base64 32` (local key) and
any 12+ character dev password. `KMS_MODE=local` replaces KMS with a key from the environment
and enables a dev sign-in form; both are refused unless Supabase runs on localhost.

| Command             | What it runs                                      |
| ------------------- | ------------------------------------------------- |
| `bun run test`      | Unit tests (crypto, formatting, audit wording)    |
| `bun run test:db`   | pgTAP tests of access rules and the audit log     |
| `bun run check`     | Type checks                                       |
| `pre-commit run -a` | Every linter: SQL, Dockerfile, workflows, code    |
| `bun run db:types`  | Regenerates `database.types.ts` after a migration |

## Production setup

### 1. Google Cloud

1. OAuth consent screen: user type **Internal**. This is the control that keeps every account
   outside the Workspace out. Add the scope `https://www.googleapis.com/auth/cloudkms`.
2. OAuth client (web): authorised redirect URI `https://<project>.supabase.co/auth/v1/callback`.
3. A KMS key, with encrypt and decrypt granted to the Google group of the members:

```bash
gcloud kms keyrings create openpwd --location europe-west1
```

```bash
gcloud kms keys create vault --keyring openpwd --location europe-west1 --purpose encryption
```

```bash
gcloud kms keys add-iam-policy-binding vault --keyring openpwd --location europe-west1 --member group:passwords@<domain> --role roles/cloudkms.cryptoKeyEncrypterDecrypter
```

4. Enable Data Access audit logs for Cloud KMS (IAM & Admin → Audit Logs).
5. Keep the OAuth client and the key in the **same project**, with the Cloud KMS API enabled
   there. Google does not document which project is billed for a call made with a member's
   token; this is the arrangement to test first.
6. In the Workspace admin console, check two settings that can block the flow: the session
   length for Google Cloud services (forces re-authentication) and API controls (if Google
   Cloud is restricted, mark internal apps as trusted).

The application has no Google Cloud credentials of its own and must never be given any.

### 2. Supabase

1. Create the project (EU region) and apply `supabase/migrations`.
2. Auth → Providers: enable Google with the OAuth client, **disable Email**.
3. Auth → URL configuration: site URL `https://<app-domain>`, redirect
   `https://<app-domain>/auth/callback`.
4. Auth → Hooks: enable "Before user created" with `public.hook_before_user_created`.
5. Set the allowed domain once, in the SQL editor:

```sql
insert into private.instance_settings (key, value) values ('allowed_email_domain', '<domain>');
```

Notes on the Free plan: a project with low activity for 7 days is paused, and there are no
backups. Session time-boxing in the dashboard is a paid feature; OpenPwd enforces its own
limit in the database, adjustable with the `max_session_minutes` setting (same table as the
allowed domain).

### 3. Deploy on Coolify

- **Build pack**: Dockerfile.
- **Ports Exposes**: `3000`.
- **Persistent Storage**: none. The container is stateless; all data lives in Supabase.
- **Health check**: defined in the image (`/healthz`, which queries the database). Leave
  Coolify's own health check off.
- **Environment variables**:

| Variable                   | Value                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| `ORIGIN`                   | `https://<app-domain>`                                                      |
| `ADDRESS_HEADER`           | `x-forwarded-for` (with `XFF_DEPTH=1`), so the audit log records client IPs |
| `SUPABASE_URL`             | `https://<project>.supabase.co`                                             |
| `SUPABASE_PUBLISHABLE_KEY` | The publishable key. Never the secret key.                                  |
| `ALLOWED_GOOGLE_DOMAIN`    | The Workspace domain                                                        |
| `KMS_MODE`                 | `google`                                                                    |
| `KMS_KEY_NAME`             | `projects/<p>/locations/europe-west1/keyRings/openpwd/cryptoKeys/vault`     |

- **Backups**: the database is the only state. Use Supabase backups (paid plans) or a
  scheduled encrypted `pg_dump`. A dump holds ciphertext only; it is useless without KMS, and
  the KMS key is useless without the dump, so never delete the key.

### Continuous deployment

A push to `main` deploys the application through Coolify Auto Deploy. Database migrations are
applied by the Supabase GitHub integration (Project settings → Integrations → GitHub, deploy to
production on `main`). Both run on the same push, in no guaranteed order, so a migration must
stay compatible with the previous application version: add first, remove in a later release.

GitHub Actions only checks: `quality` (linters, unit and database tests, build), `build`
(image build and Trivy scan), `security` (weekly dependency and secret scan).

## Access model

| Role   | Passwords   | Members                   | Audit log |
| ------ | ----------- | ------------------------- | --------- |
| member | read, write | see, leave                | no        |
| admin  | read, write | add, remove, change roles | read      |
| owner  | read, write | same, and manage owners   | read      |

An organization can point at its own KMS key (`organizations.kms_key_name`, set in SQL); by
default all organizations share `KMS_KEY_NAME`, and separation between them is enforced by the
database.
