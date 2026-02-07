# Fase 3 closeout (2026-02-07)

## Objetivo

Cerrar estabilidad E2E local CI con emuladores y alinear entorno para evitar falsos verdes.

## Cambios aplicados

- `scripts/seed.mjs`
  - Se reforzo la resolucion de project id para seed y se evito fallback accidental a `VITE_FIREBASE_PROJECT_ID` salvo flag explicita.
- `playwright.config.ts`
  - Se unifico seleccion de project id.
  - `reuseExistingServer` se fijo en `false` para corridas deterministas.
- `scripts/run-e2e-local-ci.mjs` (nuevo)
  - Runner cross-platform para ejecutar seed + Playwright dentro de `firebase emulators:exec`.
- `package.json`
  - Scripts nuevos: `test:e2e:local-ci` y `test:e2e:local-ci:smoke`.
- `e2e/helpers/session.ts`
  - Se agrego espera explicita de shell autenticado.
- `e2e/helpers/group.ts` (nuevo)
  - Helper de readiness para detalle de grupo.
- `e2e/groups.spec.ts`, `e2e/critical-flows.spec.ts`
  - Uso de waits de readiness para reducir flaky.
- `src/features/groups/components/GroupDetailContainer.tsx`
  - Deja de bloquear skeleton por cargas secundarias de perfiles.
- `functions/package.json`
  - `firebase-functions` fijado en `^6.3.2` para compatibilidad estable con emulador y codigo v1.
- `functions/src/index.ts`
  - Migracion de `admin.firestore.FieldValue` a `FieldValue` desde `firebase-admin/firestore`.
  - Fix en transaccion `ensureGroupConversationForMember` (lecturas antes de escrituras).
- `functions/lib/index.js`
  - Recompilado con `npm run build`.

## Validacion ejecutada

- `npm run lint` -> OK.
- `npm run test:e2e:local-ci:smoke` repetido 10 veces previamente -> 10/10 pass (registrado en sesion previa).
- `npm run test:e2e:local-ci` repetido 3 veces (loop final) -> 3/3 pass.
- Verificacion adicional: no aparecen errores de runtime en triggers por `functions.config()` ni por `serverTimestamp`/orden de transaccion.

## Riesgos residuales (no bloqueantes para esta fase)

- Emulador muestra aviso por version de `firebase-functions` no-latest. Es esperado por pin en `6.3.2`.
- Sigue advertencia de chunks > 500KB en build Vite.
- En emulador aparece warning de ADC/permisos (`adminSdkConfig` 403) en entorno local; no rompio las corridas.

## Estado Fase 3

- Estado: completada
- Gate de estabilidad local CI: cumplido
