# iOS Migration Weekly Status

Estado: activo  
Inicio: 2026-02-11

## Template semanal (copiar por semana)

### Semana XX (YYYY-MM-DD a YYYY-MM-DD)

1. Objetivo de la semana:
2. Entregables comprometidos:
3. Entregables completados:
4. Gates (Go/No-Go):
5. Riesgos nuevos:
6. Bloqueos:
7. Metricas:
   - Crash-free:
   - p95 login:
   - p95 feed:
   - Reads/user/day:
   - Error rate Functions:
8. Decisiones tecnicas:
9. Proximo paso:

## Semana 1 (2026-02-11 a 2026-02-17)

1. Objetivo de la semana:
   - Cerrar artefactos base de gobernanza para migracion iOS nativa.
2. Entregables comprometidos:
   - `docs/ios-contracts-v1.md`
   - `docs/ios-risk-register.md`
   - `docs/ios-parity-matrix.md`
   - `docs/ios-rollback-playbook.md`
3. Entregables completados:
   - `docs/ios-native-migration-plan-operativo.md`
   - `docs/ios-contracts-v1.md`
   - `docs/ios-risk-register.md`
   - `docs/ios-parity-matrix.md`
   - `docs/ios-rollback-playbook.md`
4. Gates (Go/No-Go):
   - GO parcial: base documental y controles creados.
   - GO condicional para Semana 2: mantener freeze de contratos y no introducir cambios destructivos.
5. Riesgos nuevos:
   - Dual-run web+iOS puede generar divergencias si no se respeta contrato versionado.
   - Rollout de App Check puede bloquear trafico legitimo si no se hace gradual.
6. Bloqueos:
   - Membresia Apple Developer para cierre SIWA/APNs/TestFlight.
7. Metricas:
   - Compliance gate baseline: `npm run gate:appstore` -> PASS (modo baseline).
   - Compliance gate submit: `npm run gate:appstore:submit` -> FAIL esperado por SIWA/credenciales review.
   - Lint/typecheck/build web -> PASS.
   - `npm run test:rules` -> PASS (36 tests, auth/firestore/storage rules).
   - `npm run test:delete-account:harness` -> PASS (borrado + idempotencia verificados).
8. Decisiones tecnicas:
   - Se mantiene backend actual y se reescribe solo cliente iOS.
   - Se ejecuta dual-run controlado con feature flags y kill switches.
   - Review notes finales se generan desde env local (`REVIEW_PROD_*`) sin secretos en git.
9. Proximo paso:
   - Semana 2: endurecer contratos backend y pruebas de contrato por dominio critico.

## Semana 2 (2026-02-18 a 2026-02-24) - ejecucion anticipada completada

1. Objetivo de la semana:
   - Hardening backend de contratos para dual-run (web+iOS).
2. Entregables comprometidos:
   - `docs/ios-contract-rfc-template.md`
   - `docs/ios-contract-test-matrix.md`
   - `docs/ios-week2-hardening-checklist.md`
3. Entregables completados:
   - `docs/ios-contract-rfc-template.md`
   - `docs/ios-contract-test-matrix.md`
   - `docs/ios-week2-hardening-checklist.md`
4. Gates (Go/No-Go):
   - GO tecnico: checklist de hardening ejecutado en anticipado con P0 en verde.
   - GO condicional release: permanece bloqueo externo de Apple Developer para cierre SIWA/APNs/TestFlight.
5. Riesgos nuevos:
   - Ninguno adicional; usar `docs/ios-risk-register.md`.
6. Bloqueos:
   - Membresia Apple Developer sigue bloqueando cierre SIWA/APNs/TestFlight.
7. Metricas:
   - `npm run test:rules` -> PASS (36 tests).
   - `npm run test:delete-account:harness` -> PASS (delete + idempotencia).
   - `npm run gate:appstore` -> PASS baseline.
   - `npm run lint` -> PASS.
   - `npm run typecheck` -> PASS.
   - `npm run build` -> PASS.
8. Decisiones tecnicas:
   - Todo cambio de contrato nuevo debe iniciar por RFC.
9. Proximo paso:
   - Semana 3: cerrar versionado logico de payloads y plan de App Check en staging.

## Semana 3 (2026-02-25 a 2026-03-03) - preparado

1. Objetivo de la semana:
   - Formalizar versionado de payloads y rollout de App Check.
2. Entregables comprometidos:
   - `docs/ios-payload-versioning-plan.md`
   - `docs/ios-app-check-rollout-plan.md`
   - `docs/app-store-privacy-age-rating-draft.md`
3. Entregables completados:
   - `docs/ios-payload-versioning-plan.md`
   - `docs/ios-app-check-rollout-plan.md`
   - `docs/app-store-privacy-age-rating-draft.md`
4. Gates (Go/No-Go):
   - GO de preparacion: artefactos creados y enlazados al plan maestro.
   - GO de ejecucion pendiente: aplicar en staging y medir falsos positivos.
5. Riesgos nuevos:
   - Ninguno adicional; riesgos App Check ya registrados como R-007.
6. Bloqueos:
   - El rollout final de iOS depende de app nativa operativa.
7. Metricas:
   - `npm run test:api` -> PASS (28 tests, contratos API incluyendo `api/chat`).
   - Implementacion App Check web -> completada (hook/env/tipado), rollout staging pendiente.
   - App Store preflight -> PASS con evidencia ampliada (ruta in-app Community Guidelines + permisos `Info.plist`).
   - App Store preflight -> merge de `.env.local + .env.example` para reducir falsos WARN de configuracion.
   - `npm run gate:appstore:submit` -> FAIL controlado con 2 bloqueos reales (SIWA habilitado + credenciales review productivas).
   - `npm run lint` -> PASS.
   - `npm run typecheck` -> PASS.
   - `npm run build` -> PASS.
   - `npm run gate:appstore` -> PASS baseline.
   - Pendiente de corrida de staging App Check (monitor mode + enforcement).
8. Decisiones tecnicas:
   - App Check se despliega por fases, nunca en big-bang de produccion.
9. Proximo paso:
   - Ejecutar Fase 0/1 de `docs/ios-app-check-rollout-plan.md` en staging.

## Actualizacion consolidada (2026-02-12)

1. Objetivo:
   - Reconciliar estado real vs estado documentado para evitar confusion en siguientes conversaciones.
2. Verificaciones ejecutadas:
   - `npm run validate` -> PASS.
   - `npm run preflight:appstore` -> PASS (44 PASS / 0 WARN / 0 FAIL).
   - `npm run gate:appstore:submit` -> PASS (17 PASS / 0 WARN / 0 FAIL).
   - `npm run test:rules` -> PASS (36 tests).
   - `npm run test:delete-account:harness` -> PASS.
3. Cambio de estado clave:
   - Membresia Apple Developer: activa.
   - Configuracion SIWA (Apple + Firebase): completada en baseline web/compliance.
4. Punto actual del plan:
   - Semanas 0-3: completadas en baseline.
   - Siguiente fase activa: Semana 4 (base iOS nativa en Mac/Xcode).
5. Bloqueos reales vigentes:
   - Entorno Mac + Xcode + signing/provisioning.
   - Pruebas en iPhone real (SIWA nativo, push, camara, haptics).
   - Cierre manual App Store Connect (labels/age rating/screenshots/review notes finales).
   - App Check rollout en staging (sigue desactivado por defecto).
6. Proximo paso operativo:
   - Iniciar setup en Mac y ejecutar checklist de entrada a Semana 4.
