# Registro de Despliegues - Vinctus

## 📅 [Fecha Actual] - v1.3.4 - Redespliegue Completo (Iteración)
**Estado:** ✅ Desplegado

### 🔄 Redespliegue General
- **Backend:** `firebase deploy --only firestore:rules,firestore:indexes,storage` ejecutado con éxito.
- **Frontend:** Commit manual `chore: full redeploy with latest user changes` empujado a main. Dispara build en Vercel.

### 📝 Notas
- Sincronización rutinaria tras ediciones adicionales del usuario (presumiblemente mejoras en UI/Mensajes).
- Índices de Firestore confirmados y desplegados nuevamente.

## 📅 [Fecha Anterior] - v1.3.3 - Redespliegue Completo + Índices
**Estado:** ✅ Desplegado
- Inclusión explícita de `firestore:indexes`.

## 📅 [Fecha Anterior] - v1.3.2 - Redespliegue con Últimos Cambios
**Estado:** ✅ Desplegado
