# Registro de Despliegues - Vinctus

## 📅 [Fecha Actual] - v1.3.2 - Redespliegue con Últimos Cambios del Usuario
**Estado:** ✅ Desplegado

### 🔄 Redespliegue General
- **Backend:** `firebase deploy --only firestore:rules,storage` ejecutado exitosamente.
- **Frontend:** Commit manual `chore: redeploy with latest user changes` empujado a main. Dispara build en Vercel.

### 📝 Resumen de Cambios Recientes
- Despliegue solicitado por el usuario tras ediciones manuales (presumiblemente en mensajería o UI).
- Sincronización completa de reglas de respaldo y código fuente.

## 📅 [Fecha Anterior] - v1.3.1 - Redespliegue Manual Completo
**Estado:** ✅ Desplegado
- Sincronización completa de Backend y Frontend tras correcciones críticas.

## 📅 [Fecha Anterior] - v1.3.0 - Mejoras en Autenticación
**Estado:** ✅ Desplegado
- **Recuperación de Contraseña:** Implementado.
- **Verificación de Correo:** Implementado.
- **Login Celular:** Corregido (Región Perú).
