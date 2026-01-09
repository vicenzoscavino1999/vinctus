# Cloud Functions Deployment Guide

## 📋 Overview

Esta guía te ayudará a deployar las Cloud Functions que manejan contadores atómicos para Vinctus.

## 🎯 Funciones Implementadas

| Función | Trigger | Descripción |
|---------|---------|-------------|
| `onGroupMemberCreated` | `onCreate groups/{gid}/members/{uid}` | Incrementa `memberCount` |
| `onGroupMemberDeleted` | `onDelete groups/{gid}/members/{uid}` | Decrementa `memberCount` |
| `onPostLikeCreated` | `onCreate posts/{pid}/likes/{uid}` | Incrementa `likesCount` |
| `onPostLikeDeleted` | `onDelete posts/{pid}/likes/{uid}` | Decrementa `likesCount` |
| `onGroupDeleted` | `onDelete groups/{gid}` | Limpia members subcollection |
| `onPostDeleted` | `onDelete posts/{pid}` | Limpia likes subcollection |

## 🚀 Deployment Steps

### Paso 1: Instalar Dependencias

```bash
cd functions
npm install
```

**Tiempo:** ~2 minutos

### Paso 2: Compilar TypeScript

```bash
npm run build
```

**Output esperado:**
```
Successfully compiled 1 file with TypeScript
```

### Paso 3: Login a Firebase (si no lo has hecho)

```bash
firebase login
```

**Tiempo:** ~30 segundos (abre navegador para autenticación)

### Paso 4: Seleccionar Proyecto

```bash
firebase use vinctus-daf32
```

**Output esperado:**
```
Now using project vinctus-daf32
```

### Paso 5: Deploy Functions

```bash
# Desde la raíz del proyecto
firebase deploy --only functions
```

**Output esperado:**
```
✔ functions: Finished running predeploy script.
i functions: preparing codebase default for deployment

✔ functions[onGroupMemberCreated(us-central1)]: Successful create operation.
✔ functions[onGroupMemberDeleted(us-central1)]: Successful create operation.
✔ functions[onPostLikeCreated(us-central1)]: Successful create operation.
✔ functions[onPostLikeDeleted(us-central1)]: Successful create operation.
✔ functions[onGroupDeleted(us-central1)]: Successful create operation.
✔ functions[onPostDeleted(us-central1)]: Successful create operation.

✔ Deploy complete!
```

**Tiempo:** ~5-10 minutos (primera vez), ~2 minutos (updates)

## ⚙️ Configuración del Proyecto

### Requisitos

- ✅ Plan Blaze (Pay-as-you-go) activado
- ✅ Billing account configurada
- ✅ Node.js 18+ instalado

### Activar Plan Blaze

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona proyecto: **vinctus-daf32**
3. Settings (⚙️) → Usage and billing
4. Click **Modify plan**
5. Selecciona **Blaze (Pay as you go)**
6. Ingresa método de pago
7. Click **Continue**

**Nota:** No te cobrarán mientras estés dentro del free tier (2M invocaciones/mes).

## 🧪 Testing

### Test Manual en Firebase Console

1. Ve a **Firestore Database**
2. Navega a `groups/test-group`
3. Verifica que `memberCount: 0`
4. Crea un documento en `groups/test-group/members/test-user`:
   ```json
   {
     "uid": "test-user",
     "groupId": "test-group",
     "role": "member",
     "joinedAt": "<serverTimestamp>"
   }
   ```
5. Espera 3-5 segundos
6. Refresca `groups/test-group`
7. **Verifica:** `memberCount: 1` ✅

### Test desde la App

```typescript
// En la app autenticado
await joinGroupWithSync('quantum', currentUser.uid);

// Ve a Firestore Console
// groups/quantum → memberCount debe incrementarse
```

### Ver Logs

```bash
# Logs en tiempo real
firebase functions:log --only onGroupMemberCreated

# Últimos 100 logs
firebase functions:log --limit 100
```

**Output esperado:**
```
2024-01-08T23:00:00.123Z - INFO - Member joined group
  { groupId: 'quantum', userId: 'abc123' }
2024-01-08T23:00:00.456Z - INFO - Member count incremented
  { groupId: 'quantum' }
```

## 📊 Monitoreo

### Firebase Console

1. Functions → Dashboard
2. Verás métricas de:
   - Invocaciones
   - Errores
   - Latencia
   - Memoria usada

### Debugging

Si una function falla:
```bash
# Ver errores recientes
firebase functions:log --only onGroupMemberCreated --limit 50
```

**Common errors:**
- `Missing or insufficient permissions` → Revisa Security Rules
- `Document not found` → El grupo/post no existe
- `DEADLINE_EXCEEDED` → Timeout (aumenta timeout en config)

## 💰 Costos y Optimización

### Free Tier (Mensual)

- 2M invocaciones
- 400k GB-segundos
- 200k CPU-segundos

### Cálculo de Costos

**Estimación conservadora:**
- 100 usuarios/día
- 10 likes + 3 joins por usuario = 13 acciones/día
- Total: 1,300 invocaciones/día
- **Mensual:** 39,000 invocaciones (~2% del free tier)

**Costo:** $0.00

### Optimizaciones Implementadas

✅ **Error handling** - No falla silenciosamente
✅ **Prevent negative counters** - Lee antes de decrementar  
✅ **Batch cleanup** - Chunks de 450 para no exceder límite  
✅ **Logging estructurado** - Debug fácil  
✅ **Safety margins** - No commitea si count ya es 0  

## 🔄 Updates y Re-deploys

### Cambiar Código

1. Edita `functions/src/index.ts`
2. Compila: `npm run build`
3. Deploy: `firebase deploy --only functions`

### Deploy Selectivo

```bash
# Solo una función
firebase deploy --only functions:onGroupMemberCreated

# Varias funciones
firebase deploy --only functions:onGroupMemberCreated,functions:onPostLikeCreated
```

## 🆘 Troubleshooting

### "Error: HTTP Error: 403, Permission Denied"

**Solución:**
- Verifica que el plan Blaze esté activo
- Verifica permisos en IAM (Firebase Admin SDK)

### "Error: Cannot find module 'firebase-functions'"

**Solución:**
```bash
cd functions
rm -rf node_modules package-lock.json
npm install
```

### Functions no se disparan

**Checklist:**
1. ✅ Functions deployed correctamente
2. ✅ Logs no muestran errores
3. ✅ El path del documento coincide exactamente con el trigger
4. ✅ Security Rules permiten el write original

### Contadores desincronizados

**Backfill script:**
```bash
# Ejecuta desde functions/
node scripts/backfill-counters.js
```

(Script incluido en next section)

## 📝 Backfill Script (Opcional)

Si ya tienes datos en Firestore sin contadores, ejecuta:

**functions/scripts/backfill-counters.js:**
```javascript
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function backfillGroupCounters() {
  const groups = await db.collection('groups').get();
  
  for (const groupDoc of groups.docs) {
    const membersSnap = await db
      .collection(`groups/${groupDoc.id}/members`)
      .get();
    
    await groupDoc.ref.update({
      memberCount: membersSnap.size,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ ${groupDoc.id}: ${membersSnap.size} members`);
  }
  
  console.log('✅ All groups backfilled');
}

backfillGroupCounters().then(() => process.exit(0));
```

**Ejecutar:**
```bash
cd functions
node scripts/backfill-counters.js
```

## 🎉 Success Checklist

- ✅ Functions deployed sin errores
- ✅ Test manual incrementa/decrementa contadores
- ✅ Logs muestran "Member count incremented"
- ✅ App muestra contadores reales en UI
- ✅ No hay errores en Firebase Console

## 📚 Referencias

- [Cloud Functions Docs](https://firebase.google.com/docs/functions)
- [Firestore Triggers](https://firebase.google.com/docs/functions/firestore-events)
- [FieldValue.increment()](https://firebase.google.com/docs/reference/node/firebase.firestore.FieldValue#increment)
