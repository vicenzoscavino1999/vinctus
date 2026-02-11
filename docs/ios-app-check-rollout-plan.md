# Plan de Rollout App Check (Web + iOS)

Estado: activo  
Fecha base: 2026-02-11  
Owner: Vicenzo

## Objetivo

Activar App Check de forma gradual sin bloquear usuarios legitimos ni romper flujos criticos.

## Alcance

1. Cliente web (Vercel).
2. Cliente iOS nativo (cuando exista app SwiftUI operativa).
3. Servicios Firebase usados por cliente: Firestore, Storage, Functions (segun aplique).

## Estado de implementacion actual

1. Hook de App Check web integrado en `src/shared/lib/firebase.ts` (inicializacion opcional por env).
2. Variables disponibles en `.env.example`:
   - `VITE_ENABLE_FIREBASE_APP_CHECK`
   - `VITE_FIREBASE_APP_CHECK_SITE_KEY`
   - `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN`
   - `VITE_FIREBASE_APP_CHECK_TOKEN_AUTO_REFRESH`
3. Tipado de variables actualizado en `src/vite-env.d.ts`.
4. App Check permanece apagado por defecto (`false`) para evitar impacto en produccion.

## Checklist tecnico previo (web/staging)

- [ ] Configurar `VITE_ENABLE_FIREBASE_APP_CHECK=true` solo en staging.
- [ ] Configurar `VITE_FIREBASE_APP_CHECK_SITE_KEY` valido para staging.
- [ ] Definir `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN=true` solo en pruebas controladas.
- [ ] Ejecutar `npm run preflight:appcheck` y revisar warnings.
- [ ] Ejecutar smoke baseline:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run gate:appstore`

## Fases de rollout

## Fase 0 - Preparacion

1. Inventariar endpoints/servicios que requieren token App Check.
2. Definir porcentaje inicial de enforcement.
3. Definir dashboards y alertas:
   - errores 401/permission-denied
   - caida de trafico legitimo
   - errores por plataforma

Gate:

1. Dashboard y alertas listos.

## Fase 1 - Staging (monitor mode)

1. Activar App Check en staging sin enforcement estricto inicial.
2. Medir falsos positivos 24-48h.
3. Ajustar configuracion cliente y backend.
4. Ejecutar `npm run preflight:appcheck:strict` con env staging.

Gate:

1. Error rate adicional <= 1% y sin impacto en flows P0.

## Fase 2 - Staging (enforcement)

1. Activar enforcement en staging.
2. Ejecutar smoke completo:
   - auth
   - feed
   - create post
   - report
   - delete account
   - ai consent + ai chat/arena

Gate:

1. Todos los flujos P0 en verde.

## Fase 3 - Produccion gradual

1. Empezar con porcentaje bajo (canary).
2. Monitorear 24h.
3. Escalar gradualmente hasta 100%.
4. Ejecutar `npm run preflight:appcheck:production` antes de cada incremento.

Gate:

1. Sin incremento significativo de errores P0.

## Fase 4 - Operacion estable

1. Documentar runbook de incidentes.
2. Agregar chequeo App Check a checklist semanal.
3. Revisar metrica de falsos positivos semanalmente.

## Rollback rapido

1. Si error rate sube o flujos P0 fallan:
   - desactivar enforcement de App Check en el servicio afectado
   - mantener monitoreo para confirmar recuperacion
2. Registrar incidente en `docs/ios-risk-register.md`.

## Checklist previo a activar enforcement en produccion

- [ ] Staging en verde con enforcement.
- [ ] Riesgos actualizados en `docs/ios-risk-register.md`.
- [ ] Weekly status actualizado con evidencia.
- [ ] Plan de rollback probado.
- [ ] Equipo alineado sobre ventana de cambio.
