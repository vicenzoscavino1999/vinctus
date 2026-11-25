# App Review Notes Draft - Vinctus

Fecha: 2026-02-11
Estado: borrador para App Store Connect

## Reviewer quick path

1. En la compilación de producción, iniciar sesión con la cuenta de demostración. La pantalla de acceso también ofrece Google y Apple.
2. Desde Perfil, abrir el engranaje de Ajustes. Allí se encuentran los enlaces legales, la opción de eliminar la cuenta y el consentimiento de IA.
3. Desde el menú de una publicación, historia o perfil de prueba, enviar un reporte o bloquear al usuario. En Ajustes se puede abrir la lista de usuarios bloqueados.
4. En Descubrir, abrir Chat con IA o Arena IA. Antes del primer uso, la app pide permiso para enviar el texto al proveedor. El permiso se puede retirar desde Ajustes.
5. Para comprobar el borrado, usar una segunda cuenta de prueba destinada a ese flujo. La cuenta principal de revisión debe seguir disponible.

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
