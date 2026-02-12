# iOS Parity Matrix (Web vs iOS)

Estado: activo  
Fecha base: 2026-02-11  
Ultima actualizacion: 2026-02-11

## Leyenda

1. Estado iOS: `no iniciado`, `en progreso`, `paridad funcional`, `paridad completa`.
2. Riesgo: `bajo`, `medio`, `alto`.
3. Criticidad: `P0`, `P1`, `P2`.
4. Backend readiness: `listo`, `parcial`, `bloqueado`.

## Matriz

| Feature                        | Web actual     | iOS pantalla/modulo       | Backend dependencia             | Backend readiness | Estado iOS  | Criticidad | Riesgo | Gate de exito                                | Evidencia actual                                                          |
| ------------------------------ | -------------- | ------------------------- | ------------------------------- | ----------------- | ----------- | ---------- | ------ | -------------------------------------------- | ------------------------------------------------------------------------- |
| Login email/password           | si             | LoginView/AuthRepo        | Firebase Auth                   | listo             | no iniciado | P0         | medio  | Login + persistencia sesion                  | `src/app/providers/AuthContext.tsx`                                       |
| Login Google                   | si             | LoginView/AuthRepo        | Firebase Auth                   | listo             | no iniciado | P0         | medio  | Login Google estable                         | `src/features/auth/components/LoginScreen.tsx`                            |
| Login Apple                    | parcial (flag) | LoginView/AuthRepo        | Apple + Firebase Auth           | parcial           | no iniciado | P0         | alto   | Paridad con Google en iOS                    | `docs/apple-sign-in-setup.md`                                             |
| Feed lectura                   | si             | FeedView/FeedRepo         | Firestore posts                 | listo             | no iniciado | P0         | medio  | p95 + paginacion estable                     | `src/features/posts/pages/FeedPage.tsx`                                   |
| Crear post                     | si             | CreatePostView/PostsRepo  | Firestore + Storage + Functions | parcial           | no iniciado | P0         | medio  | No duplicados + media ok                     | `src/features/posts/components/CreatePostModal.tsx`                       |
| Comentarios                    | si             | PostDetailView/PostsRepo  | Firestore                       | listo             | no iniciado | P1         | medio  | Crear/leer comentarios                       | `src/features/posts/components/PostCommentsModal.tsx`                     |
| Chat 1:1                       | si             | ChatView/ChatRepo         | Firestore                       | listo             | no iniciado | P0         | alto   | Send/receive estable                         | `src/features/chat/pages/ConversationDetailsPage.tsx`                     |
| Chat grupal                    | si             | GroupChatView/ChatRepo    | Firestore                       | listo             | no iniciado | P1         | alto   | Paginacion + costo controlado                | `src/features/chat/pages/GroupConversationDetailsPage.tsx`                |
| Report user/group/post/comment | si             | ReportFlow/ModerationRepo | Firestore reports + Functions   | listo             | no iniciado | P0         | medio  | Ticket en cola moderacion                    | `src/shared/lib/firestore/reports.ts`, `functions/src/index.ts`           |
| Bloquear usuario               | si             | Profile/Chat actions      | Firestore                       | listo             | no iniciado | P0         | medio  | Efecto inmediato en UI                       | `src/features/chat/api/mutations.ts`                                      |
| Delete account                 | si             | Settings/DangerZone       | Functions deleteAccount         | parcial           | no iniciado | P0         | alto   | Borrado sin residuos                         | `functions/src/deleteAccount.ts`, `scripts/delete-account-v2-harness.mjs` |
| AI consent                     | si             | Settings/ComplianceRepo   | Firestore users.settings.ai     | listo             | no iniciado | P0         | medio  | Sin consentimiento no IA                     | `src/shared/lib/firestore/aiConsent.ts`                                   |
| AI Chat                        | si             | AIChatView                | API chat + consent backend      | listo             | no iniciado | P1         | medio  | Funciona + kill switch                       | `api/chat.ts`, `src/features/ai/pages/AIChatPage.tsx`                     |
| AI Arena                       | si             | ArenaView                 | Function createDebate + consent | listo             | no iniciado | P1         | medio  | Funciona + kill switch                       | `functions/src/arena/createDebate.ts`                                     |
| Legal links                    | si             | Settings/Help/Legal views | URLs Vercel                     | listo             | no iniciado | P0         | bajo   | Links correctos visibles                     | `public/privacy.html`, `public/terms.html`, `public/support.html`         |
| Safe area + offline UX         | si             | AppShell/Shared UI        | CSS + app shell                 | listo             | no iniciado | P1         | bajo   | Sin cortes en notch + estado offline visible | `src/index.css`, `src/app/routes/AppLayout.tsx`                           |
| Push notifications             | baseline       | Notifications module      | APNs + FCM                      | parcial           | no iniciado | P1         | alto   | Token + push delivery                        | `src/shared/lib/native/pushNotifications.ts`                              |

## Notas operativas

1. Esta matriz separa "backend readiness" de "estado iOS" para evitar bloquear la migracion por UI pendiente.
2. El estado iOS se actualiza semanalmente en paralelo con `docs/ios-weekly-status.md`.
3. Cualquier feature con riesgo alto y criticidad P0 requiere plan de rollback explicito en `docs/ios-rollback-playbook.md`.
