# App Store Privacy Labels + Age Rating Draft - Vinctus

Fecha: 2026-02-11  
Estado: borrador operativo (debe validarse en App Store Connect antes de enviar)

## 1) Privacy Labels (borrador)

## Datos vinculados al usuario (probables)

1. Informacion de contacto
   - Dato: email de cuenta
   - Uso: autenticacion, soporte y seguridad
   - Fuente tecnica: Firebase Auth
2. Identificadores
   - Dato: UID de Firebase, identificador de dispositivo push (token)
   - Uso: sesion, seguridad y entrega de notificaciones
   - Fuente tecnica: Firebase Auth + Push Notifications
3. Contenido del usuario
   - Dato: posts, comentarios, historias, mensajes, reportes, perfil
   - Uso: funcionalidad principal de red social y moderacion UGC
   - Fuente tecnica: Firestore + Storage + Functions
4. Diagnosticos (si se activa Crashlytics)
   - Dato: reportes de crash y errores
   - Uso: estabilidad y correccion de fallos
   - Fuente tecnica: Firebase Crashlytics (iOS)

## Datos NO usados para tracking publicitario (baseline actual)

1. Tracking entre apps/sitios de terceros: no implementado en baseline actual.
2. SDK de ads/attribution: no detectado en baseline actual.

Nota: si en el futuro se activa tracking publicitario o attribution SDK, se debe:

1. Actualizar inmediatamente Privacy Labels.
2. Implementar ATT (`NSUserTrackingUsageDescription` + prompt en iOS).

## 2) Age Rating (borrador)

Recomendacion operativa para el cuestionario de App Store Connect:

1. Marcar que existe contenido generado por usuarios (UGC).
2. Marcar que hay moderacion (report, block, filtros, enforcement).
3. Responder con base en capacidades reales activas al momento del submit (chat, UGC, IA).
4. No fijar valor manual sin cuestionario; usar resultado oficial que entregue ASC.

## 3) Evidencia tecnica para justificar respuestas

1. Moderacion UGC: `functions/src/moderation.ts`, `functions/src/index.ts`, `src/features/moderation/pages/ModerationQueuePage.tsx`
2. Reportes y bloqueo: `src/shared/lib/firestore/reports.ts`, `src/features/chat/components/GroupReportModal.tsx`, `src/features/posts/components/ContentReportModal.tsx`
3. Delete account: `functions/src/deleteAccount.ts`, `src/features/settings/components/DeleteAccountModal.tsx`
4. AI disclosure + consentimiento: `src/features/ai/pages/AIChatPage.tsx`, `src/features/arena/pages/ArenaPage.tsx`, `src/features/settings/api/aiConsent.ts`

## 4) Checklist manual antes de completar ASC

1. Revisar data mapping final con implementacion real (no asumir).
2. Confirmar si Crashlytics/Analytics estan activos en build de release.
3. Confirmar si se guarda token push por usuario en produccion.
4. Completar Privacy Labels y Age Rating en ASC con capturas para evidencia interna.
5. Guardar snapshot final en `docs/app-store-metadata-draft.md` y `docs/app-review-notes.generated.md`.
