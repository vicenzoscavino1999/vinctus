# App Review Notes Draft - Vinctus

Fecha: 2026-02-11
Estado: borrador para App Store Connect

## Reviewer quick path

1. Login screen:
   - Email/password available
   - Google Sign-In available
   - Apple Sign-In visible cuando configuracion Apple/Firebase esta activa
2. Open Settings:
   - Legal links (privacy/terms)
   - Delete account flow
   - AI consent toggle
3. Open Help:
   - Community Guidelines link
   - Support/security contact
4. UGC controls:
   - Report user/group
   - Block user

## Test credentials

Local/emulators seed (QA interno):

- Comando: `npm run seed:app-review:emulators`
- Email: `reviewer@vinctus.local`
- Password: `Review123!`

Credenciales para App Store Review (produccion):

- Email: [REPLACE_REVIEW_EMAIL_BEFORE_SUBMIT]
- Password: [REPLACE_REVIEW_PASSWORD_BEFORE_SUBMIT]

## Compliance references

1. UGC controls:
   - Block/report UI in chat and group flows
   - Automated moderation for posts/comments
2. Delete account:
   - In-app trigger: Settings -> Delete account
   - Backend: async deletion job (`requestAccountDeletion`)
3. Legal:
   - Privacy and Terms available inside app and via public URLs
4. AI:
   - AI disclosure shown in AI Chat and Arena
   - Explicit consent gating before using AI features
   - Consent is persisted server-side and enforced in backend endpoints (`api/chat`, `createDebate`)

## Notes for Apple Sign-In

If social login (Google) is enabled in production iOS build, Apple Sign-In is also enabled at same entry level.
Configuration guide and rollout checklist are tracked in `docs/apple-sign-in-setup.md`.

## Operational note

If reviewer needs seeded content, use the provided review account with preloaded posts/groups/chats.
Seed workflow reference: `docs/app-review-demo-account.md`

## Pending before final submit

1. Set `REVIEW_PROD_EMAIL` and `REVIEW_PROD_PASSWORD` in `.env.local` and regenerate package (`npm run review:package`).
2. Confirm final production URLs.
3. Attach short video (optional) showing:
   - Login
   - Delete account request
   - Report/block
   - AI consent/disclosure
