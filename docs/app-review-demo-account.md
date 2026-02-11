# App Review Demo Account

Fecha: 2026-02-11  
Estado: operativo (baseline local/staging)

## Objetivo

Generar una cuenta de prueba y datos pre-cargados para que QA y App Review puedan validar:

1. Login y navegacion base.
2. Feed/posts/comments/likes.
3. Chat directo y chat de grupo.
4. Reportes + cola de moderacion + panel admin.
5. Settings (AI consent, legal links, delete account flow).

## Comandos

### Emuladores (recomendado para QA local)

```bash
npm run seed:app-review:emulators
```

### Si ya tienes emuladores corriendo

```bash
npm run seed:app-review
```

## Credenciales demo por defecto

- Email: `reviewer@vinctus.local`
- Password: `Review123!`
- UID: `reviewer_demo`

Puedes cambiarlo por env vars:

- `REVIEW_DEMO_UID`
- `REVIEW_DEMO_EMAIL`
- `REVIEW_DEMO_PASSWORD`

## Data que se genera

1. Usuarios demo (`users`, `users_public`, Auth).
2. Grafo social (followers/following/friends) y un usuario bloqueado.
3. Grupo publico con miembros y memberships.
4. Conversacion directa + conversacion de grupo con mensajes.
5. Posts, comentarios, likes y saved post.
6. Story activa.
7. Reportes + `moderation_queue`.
8. `app_admins/{reviewer_demo}` para acceso a `/moderation`.
9. Evento demo, colaboracion demo y support ticket demo.
10. Contribution demo con archivo en Storage.

## Seguridad para entorno productivo

Por defecto el script usa emuladores.  
Para ejecutarlo fuera de emuladores debes habilitar explicitamente:

- `REVIEW_SEED_USE_EMULATORS=false`
- `ALLOW_LIVE_REVIEW_SEED=true`

No usar en produccion sin backup y sin validar impacto de IDs demo.
