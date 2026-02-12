# RFC Template - Cambios de Contrato (Web + iOS)

Estado: template  
Version: 1.0

## 1) Metadata

1. RFC ID:
2. Fecha:
3. Autor:
4. Reviewers:
5. Dominio afectado: (auth/posts/chat/groups/moderation/settings/ai)
6. Prioridad: (P0/P1/P2)

## 2) Resumen del cambio

1. Problema actual:
2. Cambio propuesto:
3. Objetivo medible:
4. Fecha objetivo de rollout:

## 3) Contrato actual vs nuevo

| Item                 | Actual | Nuevo | Compatibilidad |
| -------------------- | ------ | ----- | -------------- |
| Coleccion/API        |        |       |                |
| Campo/parametro      |        |       |                |
| Tipo/formato         |        |       |                |
| Reglas de validacion |        |       |                |

## 4) Estrategia de compatibilidad (obligatoria)

1. `backward compatible`: si/no.
2. Si no es plenamente compatible, explicar puente temporal.
3. Defaults para clientes antiguos.
4. Fecha de deprecacion.
5. Fecha de remocion (nunca en la misma release del cambio).

## 5) Impacto por cliente

1. Web:
2. iOS nativo:
3. Backend Functions:
4. Reglas Firestore/Storage:
5. Costos (reads/writes/listeners):

## 6) Riesgos y mitigacion

| Riesgo | Probabilidad | Impacto | Mitigacion | Trigger |
| ------ | ------------ | ------- | ---------- | ------- |
|        |              |         |            |         |

## 7) Plan de rollout

1. Paso 1 (backend tolerante):
2. Paso 2 (cliente web):
3. Paso 3 (cliente iOS):
4. Paso 4 (activacion por flag):
5. Paso 5 (cleanup):

## 8) Plan de rollback

1. Kill switch/flag:
2. Accion inmediata (<30 min):
3. Criterio para hotfix:

## 9) Pruebas requeridas (checklist)

- [ ] `npm run test:rules`
- [ ] `npm run test:delete-account:harness` (si aplica)
- [ ] Tests de contrato del dominio (unit/integration)
- [ ] `npm run gate:appstore`
- [ ] Evidencia actualizada en `docs/ios-parity-matrix.md`
- [ ] Riesgos actualizados en `docs/ios-risk-register.md`

## 10) Aprobacion

1. Decision: aprobado/rechazado.
2. Condiciones:
3. Fecha de aprobacion:
