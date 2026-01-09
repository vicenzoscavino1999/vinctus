# Firestore Security Rules - Deployment Guide

## 📋 Overview

Este archivo contiene las instrucciones para deployar las Security Rules de Firestore que protegen los datos de Vinctus.

## 🔒 Reglas Implementadas

### Principios
- **Deny by default**: Todo lo que no está explícitamente permitido está denegado
- **User-scoped writes**: Los usuarios solo pueden escribir en sus propios datos
- **Authenticated reads**: Solo usuarios autenticados pueden leer
- **Data validation**: Validación de estructura y tipos en todos los writes

### Colecciones Protegidas

| Colección | Read | Write | Validación |
|-----------|------|-------|------------|
| `users/{uid}/memberships/{groupId}` | ✅ Auth only | ✅ Owner only | groupId, joinedAt |
| `users/{uid}/likes/{postId}` | ✅ Auth only | ✅ Owner only | postId, createdAt |
| `users/{uid}/savedPosts/{postId}` | ✅ Owner only | ✅ Owner only | postId, createdAt |
| `users/{uid}/savedCategories/{categoryId}` | ✅ Owner only | ✅ Owner only | categoryId, createdAt |
| `groups/{groupId}/members/{uid}` | ✅ Auth only | ✅ Owner only (self-join) | uid, groupId, role, joinedAt |
| `posts/{postId}/likes/{uid}` | ✅ Auth only | ✅ Owner only | uid, postId, createdAt |
| `groups/{groupId}` | ✅ Auth only | ❌ Admin only (TODO) | - |
| `posts/{postId}` | ✅ Auth only | ❌ Author only (TODO) | - |

## 🚀 Deployment

### Opción 1: Firebase Console (Recomendado para primera vez)

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto: **vinctus-daf32**
3. En el menú lateral: **Firestore Database** → **Rules**
4. Copia el contenido de `firestore.rules` y pégalo en el editor
5. Click **Publish**

### Opción 2: Firebase CLI

**Prerequisitos:**
```bash
npm install -g firebase-tools
firebase login
```

**Deploy:**
```bash
# Desde la raíz del proyecto
firebase deploy --only firestore:rules
```

**Nota**: Necesitas tener `firebase.json` configurado en la raíz del proyecto. Si no existe, créalo:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  }
}
```

## ✅ Testing (Opcional pero recomendado)

### Test manual en Firebase Console

1. Ve a **Firestore Database** → **Rules**
2. Click en **Rules Playground** (pestaña al lado de Rules)
3. Prueba los siguientes escenarios:

**Test 1: Usuario anónimo no puede leer**
```
Location: /users/test123/memberships/group1
Simulate: Get
Authenticated: No
Expected: ❌ Denied
```

**Test 2: Usuario autenticado puede leer sus memberships**
```
Location: /users/YOUR_UID/memberships/group1
Simulate: Get
Authenticated: Yes (con tu UID)
Expected: ✅ Allowed
```

**Test 3: Usuario NO puede escribir datos de otro usuario**
```
Location: /users/other_user_uid/memberships/group1
Simulate: Create
Authenticated: Yes (con tu UID)
Expected: ❌ Denied
```

**Test 4: Usuario PUEDE escribir sus propios datos**
```
Location: /users/YOUR_UID/memberships/group1
Simulate: Create
Authenticated: Yes (con tu UID)
Data: {"groupId": "group1", "joinedAt": "timestamp"}
Expected: ✅ Allowed
```

### Test con Emulator (Avanzado)

```bash
# Instalar emulator
firebase init emulators

# Correr tests
npm run test:firestore-rules
```

## 🔐 Security Best Practices Aplicadas

✅ **Deny by default** - Todo denegado a menos que esté explícitamente permitido  
✅ **Authentication required** - Solo usuarios autenticados pueden acceder  
✅ **User isolation** - Usuarios solo escriben en `/users/{uid}/...` donde `uid` es suyo  
✅ **Data validation** - Schema validation en todos los writes  
✅ **Immutability** - Likes y memberships son immutables (solo create/delete)  
✅ **Privacy** - savedPosts y savedCategories solo visibles para el dueño  

## ⚠️ Limitaciones Actuales

- **Groups**: Solo lectura. Crear/editar grupos requiere implementar sistema de admin
- **Posts**: Solo lectura. Crear posts requiere implementar sistema de autoría
- **Multi-country phone**: Las rules asumen `+51` (Perú). Para multi-país necesitas validación adicional

## 📝 Próximos Pasos

Una vez deployadas las rules:

1. ✅ Verifica en Firebase Console que las rules están activas
2. ✅ Prueba la app en desarrollo (`npm run dev`)
3. ✅ Verifica que los usuarios pueden:
   - Unirse/salir de grupos
   - Dar/quitar likes
   - Guardar posts/categorías
4. ❌ Verifica que los usuarios NO pueden:
   - Escribir datos de otros usuarios
   - Acceder sin autenticación
   - Escribir con estructura inválida

## 🆘 Troubleshooting

**Error: "Missing or insufficient permissions"**
- Verifica que el usuario esté autenticado (`user !== null`)
- Verifica que esté intentando escribir en su propia ruta (`/users/{su_uid}/...`)
- Verifica la estructura de datos en `firestore.ts`

**Error en desarrollo local**
- Las rules se aplican tanto en producción como en desarrollo
- Asegúrate de estar autenticado en la app antes de probar

**Las rules no se actualizan**
- Después de deploy, espera ~1 minuto para propagación
- Refresca la página de Firebase Console
- Limpia caché del navegador si es necesario

## 📚 Referencias

- [Firestore Security Rules Docs](https://firebase.google.com/docs/firestore/security/get-started)
- [Rules Playground](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
- [Common Patterns](https://firebase.google.com/docs/firestore/security/rules-conditions)
