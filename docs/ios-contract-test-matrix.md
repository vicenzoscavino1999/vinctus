# iOS Contract Test Matrix

Estado: activo  
Fecha base: 2026-02-11

Objetivo: asegurar que cambios de contrato no rompan dual-run (web + iOS) ni compliance.

## Matriz

| Dominio                | Contrato/Flujo critico             | Tipo de prueba             | Comando                                                      | Evidencia esperada                | Frecuencia                            |
| ---------------------- | ---------------------------------- | -------------------------- | ------------------------------------------------------------ | --------------------------------- | ------------------------------------- |
| Reglas Firestore       | Accesos permitidos/denegados P0    | Integration rules          | `npm run test:rules`                                         | Suite verde + denies esperados    | Cada cambio de reglas                 |
| Delete Account         | Solicitud + estado + idempotencia  | Harness emuladores         | `npm run test:delete-account:harness`                        | Borrado verificado + idempotencia | Cada cambio en delete/moderation refs |
| Compliance App Store   | Evidencia minima de requisitos     | Gate baseline              | `npm run gate:appstore`                                      | PASS baseline                     | Cada PR de compliance                 |
| Compliance Submit      | Cierre estricto pre-envio          | Gate submit                | `npm run gate:appstore:submit`                               | PASS submit                       | Solo release candidate                |
| Contratos API settings | Request/response delete account    | Unit                       | `vitest run src/features/settings/api/deleteAccount.test.ts` | Tipos y respuestas estables       | Cada cambio en API settings           |
| Contratos IA           | Consent enforcement backend        | API/function tests + smoke | `npm run test:api`                                           | Sin bypass de consentimiento      | Cada cambio IA                        |
| App Check config       | Flags/env de App Check por entorno | Preflight env              | `npm run preflight:appcheck`                                 | Config valida y riesgos visibles  | Cada cambio de rollout                |
| Build safety           | Tipado y build global              | Lint + typecheck + build   | `npm run lint && npm run typecheck && npm run build`         | Verde sin regresiones             | Cada merge importante                 |

## Criterio de aprobacion de cambio de contrato

1. Ningun test P0 puede quedar en rojo.
2. Si un test se ajusta por cambio intencional, debe existir RFC aprobado.
3. Debe actualizarse:
   - `docs/ios-contracts-v1.md`
   - `docs/ios-parity-matrix.md`
   - `docs/ios-risk-register.md`

## Registro rapido de ejecucion

| Fecha      | Dominio                                             | Resultado       | Nota                                                |
| ---------- | --------------------------------------------------- | --------------- | --------------------------------------------------- |
| 2026-02-11 | Reglas + delete account + gate baseline             | PASS            | Semana 1/2 baseline validado                        |
| 2026-02-11 | Hardening Semana 2 (rules + harness + gate + build) | PASS            | Ejecucion anticipada completa del checklist tecnico |
| 2026-02-11 | API contracts (`npm run test:api`)                  | PASS (28 tests) | Incluye `api/chat` y fallback/rate-limit paths      |
