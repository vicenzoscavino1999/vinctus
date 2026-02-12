# App Store Submission Checklist (Manual + Operativo)

Fecha base: 2026-02-11  
Scope: pasos finales para enviar Vinctus a App Store sin perder nada entre tareas tecnicas y manuales.

## Estado consolidado (2026-02-12)

- [x] `npm run validate` en verde.
- [x] `npm run preflight:appstore` en verde.
- [x] `npm run gate:appstore:submit` en verde.
- [x] `npm run test:rules` en verde.
- [x] `npm run test:delete-account:harness` en verde.
- [x] Membresia Apple Developer activa.
- [x] Sign in with Apple configurado en Apple + Firebase (baseline web/compliance).
- [ ] Setup Mac/Xcode + firma/provisioning.
- [ ] Pruebas reales en iPhone (SIWA nativo, push, camara, haptics).
- [ ] Cierre manual en App Store Connect (labels, age rating, screenshots, review notes finales).
- [ ] Rollout App Check en staging antes de enforcement.

## 1) Preflight local (sin Apple Developer activo)

Ejecutar:

```bash
npm run review:package
npm run preflight:appstore
npm run gate:appstore
npm run lint
npm run typecheck
npm run build
```

Opciones utiles:

```bash
# Gate estricto (warnings tambien fallan)
npm run preflight:appstore -- --strict

# Cuando no quieras validar reachability de URLs (por red local)
npm run preflight:appstore -- --skip-url-checks
```

Resultado esperado:

1. `docs/app-review-package.generated.md` actualizado.
2. `docs/app-review-notes.generated.md` actualizado.
3. `preflight:appstore` sin `FAIL`.
4. `gate:appstore` en verde (baseline).
5. `lint`, `typecheck` y `build` en verde.
6. URLs legales publicas alcanzables.
7. Evidencia minima de compliance detectada (Apple flag, delete account, UGC queue, AI consent, safe-area, offline UX, plugins nativos).

## 2) Bloque manual por Apple Developer (requiere pago/anualidad)

No bloquea desarrollo web, pero si bloquea submit real.

- [ ] Activar membresia Apple Developer.
- [ ] Crear/ajustar App ID con capability `Sign In with Apple`.
- [ ] Crear Service ID y configurar callback Firebase.
- [ ] Crear key `.p8` para Apple Sign-In.
- [ ] Cargar credenciales Apple en Firebase Auth provider.
- [ ] Verificar en iOS que boton Apple login funciona en igualdad con Google.

Referencia tecnica: `docs/apple-sign-in-setup.md`.

## 3) Bloque manual iOS build y firma (Mac/Xcode)

- [ ] Instalar Xcode y CocoaPods.
- [ ] `npm run ios:prepare`.
- [ ] Abrir proyecto iOS (`npm run cap:open:ios`).
- [ ] Configurar Team, Signing y Bundle ID final.
- [ ] Configurar APNs y permisos en `Info.plist` (camera/push/mic si aplica).
- [ ] Probar push, camera y haptics en iPhone real.

Referencia tecnica: `docs/capacitor-ios-setup.md`.

## 4) Bloque manual App Store Connect

- [ ] Crear app en App Store Connect con bundle correcto.
- [ ] Cargar metadata base (nombre, subtitle, descripcion, keywords, categoria).
- [ ] Cargar URLs: Privacy, Terms, Support, Community Guidelines.
- [ ] Completar Age Rating questionnaire real.
- [ ] Completar Privacy Nutrition Labels segun implementacion real.
- [ ] Cargar screenshots iPhone requeridos.
- [ ] Configurar demo account para review.
- [ ] Definir en `.env.local`:
  - `REVIEW_PROD_EMAIL`
  - `REVIEW_PROD_PASSWORD`
- [ ] Ejecutar `npm run review:package` y pegar `docs/app-review-notes.generated.md` en Review Notes.

Referencias:

- `docs/app-store-metadata-draft.md`
- `docs/app-store-privacy-age-rating-draft.md`
- `docs/app-review-notes-draft.md`
- `docs/app-review-notes.generated.md` (se genera localmente)

## 5) Validacion funcional para Review (manual)

- [ ] Seedear cuenta/demo dataset para QA interno: `npm run seed:app-review:emulators`.
- [ ] Login: email/password, Google, Apple (en iOS productivo).
- [ ] Delete account: trigger in-app + estado + borrado real verificado en backend.
- [ ] UGC: report + block + moderation queue funcionando.
- [ ] AI: disclosure visible + consentimiento obligatorio antes de usar AI.
- [ ] iOS UX: safe areas correctas en notch/home indicator.
- [ ] Offline UX: banner visible al cortar red.

## 6) Gate final de envio

Enviar solo cuando:

1. `npm run gate:appstore:submit` en verde.
2. `docs/app-review-notes.generated.md` sin placeholders.
3. Demo credentials activas y probadas.
4. Build de TestFlight validado en dispositivo real.

## 7) Post-submit readiness

- [ ] Tener respuestas preparadas para rechazo comun (4.2, 1.2, 4.8, delete account).
- [ ] Tener video corto de evidencia (login, delete account, report/block, AI consent).
- [ ] Tiempo objetivo de respuesta a App Review: < 24h.
