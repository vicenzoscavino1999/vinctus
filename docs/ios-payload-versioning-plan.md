# Plan de Versionado Logico de Payloads (Web + iOS)

Estado: activo  
Fecha base: 2026-02-11  
Owner: Vicenzo

## Objetivo

Permitir evolucionar contratos backend sin romper clientes coexistentes (web + iOS).

## Reglas

1. Todo payload nuevo incluye `schemaVersion` cuando aplique.
2. Campos nuevos: opcionales o con default server-side.
3. Campos legacy: no se eliminan hasta pasar por estado `deprecated`.
4. Cambios breaking requieren:
   - RFC aprobado (`docs/ios-contract-rfc-template.md`)
   - rollout en fases
   - puente de compatibilidad

## Estrategia de compatibilidad

1. Lectura tolerante:
   - cliente ignora campos desconocidos
   - backend acepta payloads v1 mientras exista soporte
2. Escritura progresiva:
   - backend primero
   - web despues
   - iOS despues
3. Remocion segura:
   - release N: marcar `deprecated`
   - release N+1 o N+2: remover solo si parity matrix en verde

## Contratos criticos a versionar primero

1. `requestAccountDeletion` / `getAccountDeletionStatus`
2. `reports` y `moderation_queue`
3. `users/{uid}.settings.ai`
4. `createDebate` y `/api/chat`
5. `posts` (create/update/comment)

## Checklist por cambio de payload

- [ ] RFC creado y aprobado.
- [ ] `docs/ios-contracts-v1.md` actualizado.
- [ ] Default/compatibilidad documentados.
- [ ] `docs/ios-parity-matrix.md` actualizado.
- [ ] `docs/ios-risk-register.md` actualizado.
- [ ] `npm run test:rules` en verde.
- [ ] `npm run gate:appstore` en verde.

## Criterio de exito

1. Cero regresiones de contrato P0 en QA.
2. Cero incidentes por incompatibilidad de payload en dual-run.
3. Trazabilidad completa de cambios via RFC + weekly status.
