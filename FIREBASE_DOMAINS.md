# Firebase Console - Authorized Domains Setup

## 🔐 Dominios a Autorizar en Firebase

Para que la autenticación funcione en producción, necesitas agregar estos dominios en Firebase Console:

### Ruta en Firebase Console:

```
https://console.firebase.google.com/project/vinctus-daf32/authentication/settings
```

### Dominios a agregar:

1. **Vercel Production:**

   ```
   vinctus.vercel.app
   ```

2. **Localhost (desarrollo):**

   ```
   localhost
   ```

3. **Vercel Preview URLs (opcional pero recomendado):**
   ```
   *.vercel.app
   ```

---

## 📋 Pasos para Autorizar Dominios

### 1. Abre Firebase Console

```
https://console.firebase.google.com/project/vinctus-daf32/authentication/settings
```

### 2. Navega a "Authorized domains"

- Click en "Authentication" en el menú izquierdo
- Click en la pestaña "Settings"
- Scroll hasta "Authorized domains"

### 3. Agrega los dominios

- Click en "Add domain"
- Pega: `vinctus.vercel.app`
- Click "Add"

**Repite para otros dominios si necesario.**

---

## ✅ Verificación

Una vez agregado, deberías ver en la lista:

- ✅ `localhost` (ya debería estar)
- ✅ `vinctus.vercel.app` (AGREGAR)
- ✅ `vinctus-daf32.firebaseapp.com` (ya debería estar)

---

## ⚠️ Importante

**Sin este dominio autorizado:**

- ❌ Login con Google fallará en producción
- ❌ Login con email/password puede fallar
- ❌ Redirects de autenticación fallarán
- ❌ Error: "auth/unauthorized-domain"

**Con el dominio autorizado:**

- ✅ Login funciona correctamente
- ✅ Redirects funcionan
- ✅ Google Sign-In funciona
- ✅ PWA instalada puede autenticar

---

## 🚨 Si no tienes acceso a Firebase Console

**Opción 1:** Pídele acceso al owner del proyecto
**Opción 2:** Usa Firebase CLI:

```bash
firebase auth:export domains.json
# Edita domains.json y agrega vinctus.vercel.app
firebase auth:import domains.json
```

**Opción 3:** Usa la API de Firebase Admin (requiere service account)

---

## 🔑 Login con Google/Apple desde el dominio de la app (`authDomain`)

Safari, Firefox y Chrome bloquean el almacenamiento de terceros. Si `VITE_FIREBASE_AUTH_DOMAIN`
es `vinctus-daf32.firebaseapp.com` (otro dominio), el login por redirección falla y la PWA
instalada en iPhone no puede iniciar sesión. La solución es servir el handler de Firebase desde
`vinctus.vercel.app`:

- `vercel.json` reenvía `/__/auth/*` y `/__/firebase/*` a `vinctus-daf32.firebaseapp.com`.
- El service worker no intercepta `/__/*` (`navigateFallbackDenylist` en `vite.config.ts`).
- En la PWA instalada, el login usa redirección cuando `VITE_FIREBASE_AUTH_DOMAIN` coincide con
  el dominio de la app.

Pasos (en este orden, después de desplegar el código):

1. **Google Cloud Console** → APIs & Services → Credentials → OAuth 2.0 Client
   "Web client (auto created by Google Service)":
   - Authorized JavaScript origins: agregar `https://vinctus.vercel.app`
   - Authorized redirect URIs: agregar `https://vinctus.vercel.app/__/auth/handler`
2. **Apple Developer** → Identifiers → Service IDs → (Service ID de Firebase) →
   Sign In with Apple → Configure:
   - Domains: agregar `vinctus.vercel.app`
   - Return URLs: agregar `https://vinctus.vercel.app/__/auth/handler`
3. **Firebase Console** → Authentication → Settings → Authorized domains: confirmar
   `vinctus.vercel.app`.
4. **Vercel** → Project Settings → Environment Variables (Production):
   `VITE_FIREBASE_AUTH_DOMAIN=vinctus.vercel.app` y volver a desplegar.

Verificación: `https://vinctus.vercel.app/__/firebase/init.json` debe devolver JSON (no la app).

Si se cambia el dominio de producción, repetir los pasos con el dominio nuevo.
