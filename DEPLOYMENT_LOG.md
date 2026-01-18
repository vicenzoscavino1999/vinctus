# Registro de Despliegues - Vinctus

## 📅 [Fecha Actual] - v1.3.3 - Redespliegue Completo + Índices
**Estado:** ✅ Desplegado

### 🔄 Redespliegue General
- **Backend:** `firebase deploy --only firestore:rules,firestore:indexes,storage` ejecutado con éxito.
    - Se forzó el despliegue de índices (`firestore.indexes.json`).
- **Frontend:** Commit manual `chore: full redeploy with latest user changes and indexes` empujado a main. Dispara build en Vercel.

### 📝 Resumen de Cambios Recientes
- Despliegue solicitado tras cambios adicionales del usuario.
- Inclusión explícita de índices de Firestore para optimizar consultas.

## 📅 [Fecha Anterior] - v1.3.2 - Redespliegue con Últimos Cambios del Usuario
**Estado:** ✅ Desplegado
- Sincronización completa tras ediciones manuales (mensajería/UI).

## 📅 [Fecha Anterior] - v1.3.1 - Redespliegue Manual Completo
**Estado:** ✅ Desplegado
- Sincronización completa de Backend y Frontend tras correcciones críticas.

## 📅 [Fecha Anterior] - v1.3.0 - Mejoras en Autenticación
**Estado:** ✅ Desplegado
- Recuperación de Contraseña, Verificación de Correo, Login Celular.
