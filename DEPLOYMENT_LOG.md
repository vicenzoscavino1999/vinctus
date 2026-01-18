# Registro de Despliegues - Vinctus

## 📅 [Fecha Actual] - v1.3.5 - Redespliegue Completo (Re-iteración)
**Estado:** ✅ Desplegado

### 🔄 Redespliegue General
- **Backend:** `firebase deploy --only firestore:rules,firestore:indexes,storage` enviado.
- **Frontend:** Commit manual `chore: full redeploy with latest user changes` empujado a main. Dispara build en Vercel.

### 📝 Notas
- Solicitud explícita del usuario para asegurar integridad tras cambios iterativos.

## 📅 [Fecha Anterior] - v1.3.4 - Redespliegue Completo (Iteración)
**Estado:** ✅ Desplegado
- Sincronización rutinaria.

## 📅 [Fecha Anterior] - v1.3.3 - Redespliegue Completo + Índices
**Estado:** ✅ Desplegado
- Índices de Firestore incluidos explicitamente.
