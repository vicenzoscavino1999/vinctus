# Trust & Safety SLA (UGC)

Fecha de vigencia: 2026-02-11

## Alcance

Este SLA aplica a reportes de contenido generado por usuarios en:

- publicaciones y comentarios
- perfiles y mensajes
- grupos y conversaciones

## Niveles de prioridad

1. `P0` Riesgo critico (menores, amenazas creibles, doxxing, autolesion, extorsion)
   - Tiempo objetivo de primera respuesta: <= 24 horas
   - Accion esperada: contencion inmediata (ocultar/eliminar/bloquear segun caso)
2. `P1` Abuso alto (acoso reiterado, odio, suplantacion, fraude)
   - Tiempo objetivo de primera respuesta: <= 24 horas
   - Resolucion objetivo: <= 72 horas
3. `P2` Infraccion general (spam, contenido fuera de normas, conducta disruptiva)
   - Tiempo objetivo de primera respuesta: <= 72 horas
   - Resolucion objetivo: <= 5 dias habiles

## Formato operativo de respuesta

Cada ticket/reporte debe registrar:

1. `reportId`
2. `source` (post/comment/group/user/chat)
3. `severity` (P0/P1/P2)
4. `decision` (no-action/warn/remove/suspend/ban)
5. `decisionReason`
6. `actedBy` (system/moderator)
7. `actedAt` (ISO timestamp)

## Flujo operativo actual

1. Todo `reports/{reportId}` crea una entrada espejo en `moderation_queue/{reportId}`.
2. El equipo T&S trabaja la cola desde el panel interno `/moderation`.
3. Solo usuarios con documento `app_admins/{uid}` pueden acceder al panel y actualizar estados.
4. Estados operativos permitidos: `pending`, `in_review`, `resolved`, `dismissed`.

## Canales de contacto

- Soporte general: `support@vinctus.app`
- Seguridad y abuso urgente: `security@vinctus.app`

## Trazabilidad minima

- Mantener historial de acciones para auditoria interna.
- Evitar datos sensibles en texto libre cuando no sean necesarios.
- Usar reglas de deduplicacion para prevenir doble procesamiento de reportes automaticos.
