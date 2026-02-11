# Semana 2 - Hardening Backend Checklist (Operativo)

Fecha objetivo: 2026-02-18 a 2026-02-24  
Owner: Vicenzo

## Objetivo

Cerrar hardening de contratos backend para soportar dual-run web + iOS sin regresiones.

## Checklist

- [x] Confirmar freeze de contratos activos en `docs/ios-contracts-v1.md`.
- [x] Revisar dominios P0: auth, posts, chat, reportes, delete account.
- [x] Asegurar que cambios propuestos tengan RFC en `docs/ios-contract-rfc-template.md`.
- [x] Ejecutar matriz de pruebas de contrato (`docs/ios-contract-test-matrix.md`).
- [x] Actualizar `docs/ios-parity-matrix.md` con impacto real.
- [x] Actualizar riesgos en `docs/ios-risk-register.md`.
- [x] Registrar estado en `docs/ios-weekly-status.md`.

## Comandos minimos

```bash
npm run test:rules
npm run test:delete-account:harness
npm run gate:appstore
npm run lint
npm run typecheck
npm run build
```

## Gate de salida Semana 2

1. GO solo si:
   - tests P0 en verde,
   - no hay cambios destructivos sin RFC,
   - parity matrix y risk register actualizados.
2. NO-GO si:
   - rompe delete account/reportes/auth,
   - suben costos sin explicacion ni mitigacion,
   - hay divergencia entre web y backend no documentada.

## Resultado de ejecucion (anticipado)

Fecha de corrida: 2026-02-11

1. `npm run test:rules` -> PASS (36 tests).
2. `npm run test:delete-account:harness` -> PASS (delete + idempotencia).
3. `npm run gate:appstore` -> PASS (baseline).
4. `npm run lint` -> PASS.
5. `npm run typecheck` -> PASS.
6. `npm run build` -> PASS.

Decision: GO tecnico para Semana 2 (hardening backend).  
Pendiente para cierre de release: SIWA/APNs/TestFlight (bloqueo Apple Developer).
