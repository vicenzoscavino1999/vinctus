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
