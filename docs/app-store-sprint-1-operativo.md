# Sprint 1 Operativo - App Store Readiness

Fecha base: 2026-02-11  
Duracion sugerida: 10 dias habiles  
Objetivo del sprint: cerrar base legal/compliance visible y dejar listo el terreno tecnico para Apple Sign-In + delete-account v2.

## Resultado esperado al cierre del Sprint 1

- URLs legales publicas definidas y visibles en app.
- Rutas legales in-app (privacy/terms) activas y navegables.
- Disclosure inicial de IA visible en producto.
- Flujo de soporte/contacto legal unificado.
- Backlog tecnico detallado para Sprint 2 (Apple Sign-In y borrado completo).

## Regla de ejecucion diaria

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:run -- src/features/help src/features/settings`
4. Registrar resultado en `CHECKLIST.md` (fecha, build, notas).

## Dia 1 - Legal base in-app (implementacion inicial)

### Tareas

1. Crear constantes legales reutilizables:
   - `src/shared/constants/legal.ts`
2. Exponer constantes:
   - `src/shared/constants/index.ts`
3. Crear paginas legales:
   - `src/features/legal/pages/PrivacyPolicyPage.tsx`
   - `src/features/legal/pages/TermsOfServicePage.tsx`
4. Registrar rutas:
   - `src/app/routes/AppLayout.tsx`
5. Exponer enlaces de legal:
   - `src/features/settings/pages/SettingsPage.tsx`
   - `src/features/help/pages/HelpPage.tsx`
   - `src/features/auth/components/LoginScreen.tsx`
6. Unificar correo de soporte:
   - `src/features/help/components/SupportModal.tsx`
7. Agregar variables de entorno:
   - `src/vite-env.d.ts`
   - `.env.example`

### Comandos

```bash
npm run typecheck
npm run lint
```

## Dia 2 - Public URLs + contenido legal externo

### Tareas

1. Publicar Privacy Policy y Terms en dominio publico final (vinctus.app o dominio legal dedicado).
2. Añadir Community Guidelines publica.
3. Validar que los enlaces de `VITE_PRIVACY_POLICY_URL` y `VITE_TERMS_OF_SERVICE_URL` apunten a URLs productivas.
4. Actualizar textos legales in-app para que reflejen exactamente las paginas publicas.

### Archivos

- `.env.local`
- `src/shared/constants/legal.ts`
- `docs/app-store-sprint-1-operativo.md`

### Comandos

```bash
npm run dev
npm run typecheck
```

## Dia 3 - Disclosure IA + consentimiento UI baseline

### Tareas

1. Mostrar aviso explicito en:
   - `src/features/ai/pages/AIChatPage.tsx`
   - `src/features/arena/pages/ArenaPage.tsx`
2. Incluir enlace a politica legal desde esas pantallas.
3. Agregar bandera de consentimiento en perfil/settings (lectura inicial).
4. Registrar metrica local de aceptacion/rechazo (sin tracking ads).

### Comandos

```bash
npm run typecheck
npm run test:run -- src/features/ai src/features/arena
```

## Dia 4 - UGC policy alignment

### Tareas

1. Normalizar copy de reportes y bloqueos con lenguaje de Community Guidelines.
2. Ajustar FAQ para eliminar referencias obsoletas.
3. Definir formato de respuesta operativa para abuso y tiempo objetivo de resolucion.
4. Agregar contacto de seguridad (correo) en Help.

### Archivos

- `src/features/chat/components/GroupReportModal.tsx`
- `src/features/help/pages/HelpPage.tsx`
- `docs/trust-safety-sla.md` (nuevo)

### Comandos

```bash
npm run typecheck
npm run test:run -- src/features/chat src/features/help
```

## Dia 5 - Delete account gap analysis y plan v2

### Tareas

1. Inventario de datos por coleccion/subcoleccion a borrar.
2. Documento de diferencias entre implementacion actual y requerimiento Apple.
3. Diseñar estrategia de borrado total/anomimizacion para posts/comentarios/chats.

### Archivos

- `functions/src/deleteAccount.ts` (analisis, sin romper produccion)
- `docs/delete-account-v2-design.md` (nuevo)

### Comandos

```bash
npm run functions:build
npm run typecheck
```

## Dia 6 - Test harness para delete-account v2

### Tareas

1. Crear tests de integracion con emuladores para borrado de datos de usuario.
2. Casos: usuario con posts, comentarios, grupos, mensajes, archivos.
3. Verificar idempotencia de callable de borrado.

### Comandos

```bash
npm run emulators
npm run test:rules
```

## Dia 7 - App Store package prep (parte 1)

### Tareas

1. Preparar metadata borrador:
   - descripcion corta/larga
   - keywords
   - soporte
   - legal URLs
2. Preparar notas para review (draft).

### Archivos

- `docs/app-store-metadata-draft.md` (nuevo)
- `docs/app-review-notes-draft.md` (nuevo)

## Dia 8 - QA legal + navegacion

### Tareas

1. Probar rutas legales en movil y desktop.
2. Verificar links externos desde login/help/settings.
3. Revisar contraste y legibilidad de textos legales.

### Comandos

```bash
npm run dev
npm run test:e2e:smoke
```

## Dia 9 - Hardening y limpieza

### Tareas

1. Resolver bugs visuales o de navegacion detectados.
2. Unificar copy legal en toda la app.
3. Actualizar README con seccion legal minima.

## Dia 10 - Cierre Sprint 1

### Tareas

1. Ejecutar pipeline de validacion:
   - `npm run validate`
2. Cerrar checklist manual.
3. Crear backlog Sprint 2 con tareas bloqueantes:
   - Apple Sign-In
   - Delete-account v2 real
   - Moderacion automatica UGC server-side

---

## Estado actual (hoy)

- [x] Dia 1 iniciado y aplicado en codigo.
- [x] Dia 3 aplicado en codigo (disclosure IA + consentimiento local y gating en AI).
- [x] Dia 4 aplicado en codigo (copy de reportes, contacto de seguridad y SLA Trust & Safety).
- [x] UGC report coverage ampliado a publicacion/comentario (UI + mutaciones + persistencia en `reports`).
- [x] Cola baseline de moderacion agregada en backend (`reports` -> `moderation_queue`).
- [x] Panel admin baseline para cola de moderacion (`/moderation`) + control de acceso con `app_admins/{uid}`.
- [x] Dia 5 analisis y diseno de delete-account v2 documentado.
- [x] Dia 6 aplicado: harness de emuladores para delete-account v2 + verificacion de idempotencia.
- [x] Delete account UI hardening: estado realtime (`queued/processing/completed/failed`) con polling en modal.
- [x] Dia 7 aplicado: metadata draft + review notes draft.
- [x] Dia 2 aplicado en codigo: URLs publicas legales (`/privacy`, `/terms`, `/community-guidelines`, `/support`) listas para deploy.
- [x] Capacitor baseline aplicado: config + `ios/` + plugins (push/camera/haptics) + pantalla de pruebas nativas en Settings.
- [x] AI consent server-side aplicado: persistencia en `users/{uid}.settings.ai`, sync en UI y validacion obligatoria en `api/chat` + `createDebate`.
- [x] PII guardrails IA aplicado: redaccion de email/telefono en backend antes de enviar texto a proveedores IA (`api/chat`, `createDebate`).
- [x] Safe-area hardening ampliado en overlays/modales principales para iOS notch/home indicator (auth/chat/collab/collections/events/groups/posts/profile/discover).
- [x] Accessibility baseline aplicado en modales principales: botones icon-only de cierre/eliminacion con `aria-label` (chat/posts/groups).
- [x] Offline UX baseline aplicado: banner global de "Sin conexion" con eventos `online/offline` en `AppLayout`.
- [x] Submission Kit baseline: checklist operativo final + comando `npm run preflight:appstore` para diagnostico rapido antes de submit.
- [x] Demo account baseline para App Review: seed dedicado (`seed:app-review`) con dataset de posts/chat/grupo/reportes/moderacion.
- [x] Review package generator: `npm run review:package` crea `docs/app-review-package.generated.md` listo para App Store Connect.
- [x] Review notes generator: `npm run review:package` tambien genera `docs/app-review-notes.generated.md` usando `REVIEW_PROD_*` sin guardar secretos en git.
- [x] Release gate App Store: `npm run gate:appstore` (baseline) y `npm run gate:appstore:submit` (estricto pre-envio).
- [x] Delete account hardening v2: borrado recursivo de posts/events/stories y limpieza de refs de terceros (savedPosts/likes por post).
- [x] Harness delete-account ampliado: valida comentarios/likes de terceros y subcolecciones de eventos/direct messages.
