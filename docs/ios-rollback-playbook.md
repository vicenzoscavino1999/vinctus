# iOS Rollback Playbook

Estado: activo  
Fecha base: 2026-02-11

## Principio

Rollback en iOS no es "despublicar instantaneo".  
La mitigacion real es server-side:

1. Feature flags (encender/apagar modulos).
2. Kill switches por dominio.
3. Hotfix rapido con build nueva si es necesario.

## Kill switches recomendados

| Dominio            | Flag                   | Valor seguro (rollback) | Efecto                   |
| ------------------ | ---------------------- | ----------------------- | ------------------------ |
| Auth social        | `auth_social_enabled`  | false                   | Solo email/password      |
| Apple Sign-In      | `auth_apple_enabled`   | false                   | Oculta/inhabilita SIWA   |
| Feed enrich        | `feed_enrich_enabled`  | false                   | Modo feed basico         |
| Create post        | `post_create_enabled`  | false                   | Solo lectura             |
| Chat realtime      | `chat_enabled`         | false                   | Bloquea envio chat       |
| Media upload       | `media_upload_enabled` | false                   | Bloquea subida media     |
| Moderation actions | `report_enabled`       | true                    | Mantener por compliance  |
| AI features        | `ai_enabled`           | false                   | Apaga AI Chat/Arena      |
| Push               | `push_enabled`         | false                   | Desactiva registro token |

## Procedimiento de incidentes P0 (15-30 min)

1. Confirmar alcance (usuarios, feature, version).
2. Activar kill switch correspondiente.
3. Verificar disminucion de errores en 5-10 min.
4. Comunicar estado interno y plan de fix.
5. Preparar hotfix si el problema no se mitiga solo con flag.

## Criterios para hotfix obligatorio

1. Crash recurrente en pantalla de inicio/login/feed/chat.
2. Perdida de datos o duplicados criticos.
3. Falla en delete account/reportes/compliance.
4. Error de seguridad o exposicion de PII.

## Checklist posterior al incidente

1. RCA documentada.
2. Test que prevenga regresion agregado.
3. Actualizar risk register.
4. Ajustar thresholds/alertas si aplica.
