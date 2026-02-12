# iOS Contracts v1 - Cliente <-> Backend

Estado: activo (baseline)  
Fecha base: 2026-02-11  
Owner: Vicenzo

## Reglas generales

1. No renombrar campos existentes sin plan de compatibilidad.
2. Campos nuevos deben ser opcionales o tener default seguro.
3. Operaciones criticas deben ser idempotentes.
4. Cualquier cambio requiere actualizar este documento y pruebas de contrato.
5. Si iOS requiere nuevo campo, primero se despliega backend tolerante y luego cliente.
6. Toda eliminacion de campo va en dos pasos: deprecado -> removido en release posterior.
7. Ningun callable rompe payloads existentes sin versionado explicito.

## Tabla de contratos (completar y mantener)

| Dominio               | Recurso                             | Operacion     | Campos obligatorios                   | Campos opcionales      | Version | Compatibilidad | Fuente                                        |
| --------------------- | ----------------------------------- | ------------- | ------------------------------------- | ---------------------- | ------- | -------------- | --------------------------------------------- |
| Auth                  | `users/{uid}`                       | read/update   | `uid`, `createdAt`                    | `settings`, `profile`  | v1      | backward       | `src/app/providers/AuthContext.tsx`           |
| Consent IA            | `users/{uid}.settings.ai`           | read/update   | `consentGranted`                      | `updatedAt`, `version` | v1      | backward       | `src/shared/lib/firestore/aiConsent.ts`       |
| Posts                 | `posts/{postId}`                    | create/read   | `authorId`, `content`, `createdAt`    | `media`, `tags`        | v1      | backward       | `src/features/posts/api/mutations.ts`         |
| Reports               | `reports/{id}`                      | create        | `reporterUid`, `targetType`, `reason` | `details`, `status`    | v1      | backward       | `src/shared/lib/firestore/reports.ts`         |
| Moderation queue      | `moderation_queue/{id}`             | mirror/update | `reportPath`, `priority`, `status`    | `assignedTo`, `notes`  | v1      | backward       | `functions/src/index.ts`                      |
| Admin moderation      | `app_admins/{uid}`                  | read/check    | `enabled`                             | `roles`                | v1      | backward       | `src/shared/lib/firestore/moderationQueue.ts` |
| Delete Account        | function `requestAccountDeletion`   | call          | auth context valido                   | `reason`               | v1      | idempotent     | `functions/src/deleteAccount.ts`              |
| Delete Account status | function `getAccountDeletionStatus` | call          | auth context valido                   | -                      | v1      | backward       | `functions/src/deleteAccount.ts`              |
| Arena IA              | function `createDebate`             | call          | `topic`, `mode`                       | `persona`, `maxRounds` | v1      | backward       | `functions/src/arena/createDebate.ts`         |
| Chat IA               | API `/api/chat`                     | POST          | auth + `message`                      | `history`, `context`   | v1      | backward       | `api/chat.ts`                                 |

## Functions criticas (baseline actual)

1. `requestAccountDeletion`
2. `getAccountDeletionStatus`
3. `onReportCreatedQueue`
4. `createDebate`
5. `/api/chat` (enforcement de consentimiento IA server-side)

## Politica de cambios de contrato

1. Cualquier cambio de payload debe registrar:
   - fecha
   - razon
   - impacto esperado en web/iOS
   - estrategia de compatibilidad
2. Si el cambio afecta auth, delete account o reportes, se requiere test adicional.
3. Ningun cambio pasa a produccion sin actualizar `docs/ios-parity-matrix.md`.

## Cambios registrados

| Fecha      | Cambio                                       | Impacto                             | Aprobado por |
| ---------- | -------------------------------------------- | ----------------------------------- | ------------ |
| 2026-02-11 | Documento inicial                            | Base de migracion iOS               | Vicenzo      |
| 2026-02-11 | Contratos baseline mapeados a fuentes reales | Reduce riesgo de divergence web/iOS | Vicenzo      |
