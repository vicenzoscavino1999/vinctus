# iOS Migration Risk Register

Estado: activo  
Fecha base: 2026-02-11  
Owner: Vicenzo

## Escala

1. Probabilidad: baja/media/alta.
2. Impacto: bajo/medio/alto.
3. Prioridad: P1 (critico), P2 (alto), P3 (medio), P4 (bajo).

## Riesgos

| ID    | Riesgo                                               | Probabilidad | Impacto | Prioridad | Mitigacion                                                   | Trigger                               | Owner   | Estado           |
| ----- | ---------------------------------------------------- | ------------ | ------- | --------- | ------------------------------------------------------------ | ------------------------------------- | ------- | ---------------- |
| R-001 | Incompatibilidad de schema entre web e iOS           | media        | alto    | P1        | Contratos versionados + campos opcionales + RFC obligatorio  | Error de parseo/lectura iOS           | Vicenzo | mitigado parcial |
| R-002 | Costos Firestore suben por listeners/paginacion mala | alta         | alto    | P1        | Limites listeners + metrica reads/user/day + alertas 80/100% | +25% vs baseline                      | Vicenzo | abierto          |
| R-003 | SIWA bloquea submit final                            | alta         | alto    | P1        | Mantener plan tecnico listo y activar cuando haya membresia  | `gate:appstore:submit` falla por SIWA | Vicenzo | abierto          |
| R-004 | Push/APNs falla en produccion                        | media        | medio   | P2        | Entornos separados + pruebas en iPhone real + fallback       | Tokens no registrados                 | Vicenzo | abierto          |
| R-005 | Delete account deja residuos                         | baja         | alto    | P1        | Harness + pruebas staging con datasets grandes + post-check  | Datos residuales detectados           | Vicenzo | mitigado parcial |
| R-006 | Inconsistencia entre web y iOS durante dual-run      | media        | alto    | P1        | Reglas de escritura compatibles + parity matrix semanal      | Divergencia de estado por feature     | Vicenzo | abierto          |
| R-007 | Rollout de App Check bloquea clientes legitimos      | media        | medio   | P2        | Rollout gradual en staging/prod + monitoreo falsos positivos | Aumento 401/permission-denied         | Vicenzo | mitigado parcial |
| R-008 | Placeholders en review package retrasan submit       | media        | medio   | P2        | Uso obligatorio de `review:package` con `REVIEW_PROD_*`      | Gate submit falla por placeholders    | Vicenzo | mitigado         |

## Historial

| Fecha      | ID           | Cambio                                                                                  | Resultado        |
| ---------- | ------------ | --------------------------------------------------------------------------------------- | ---------------- |
| 2026-02-11 | all          | Registro inicial creado                                                                 | en seguimiento   |
| 2026-02-11 | R-006, R-007 | Riesgos dual-run y App Check agregados                                                  | en seguimiento   |
| 2026-02-11 | R-008        | Riesgo de placeholders reducido con generacion automatica de review notes               | mitigado parcial |
| 2026-02-11 | R-005        | Ejecutado harness de delete account (`test:delete-account:harness`) con resultado OK    | mitigado parcial |
| 2026-02-11 | R-001        | Checklist hardening Semana 2 ejecutado con pruebas P0 en verde                          | mitigado parcial |
| 2026-02-11 | R-007        | Hook App Check web agregado con rollout por env (apagado por defecto)                   | mitigado parcial |
| 2026-02-11 | R-007        | Validacion tecnica tras integrar App Check: lint/typecheck/build/gate baseline en verde | mitigado parcial |
