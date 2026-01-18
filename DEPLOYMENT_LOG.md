# Registro de Despliegues - Vinctus

## 📅 [Fecha Actual] - v1.3.1 - Redespliegue Manual Completo
**Estado:** ✅ Desplegado

### 🔄 Redespliegue General
- **Backend:** `firebase deploy --only firestore:rules,storage` ejecutado exitosamente. Cargas y permisos de base de datos sincronizados.
- **Frontend:** Commit manual `chore: manual redeploy of all features and fixes` empujado a main. Dispara build en Vercel.

### 🔒 Autenticación (Reconfirmado)
- **Recuperación de Contraseña:** Incluido.
- **Verificación de Correo:** Incluido.
- **Login con Celular:** Configuración regional corregida y código actualizado.

### 📱 Móvil y PWA
- **Safari Fix & Viewport:** Confirmados en el build.

---

## 📅 [Fecha Anterior] - v1.3.0 - Mejoras en Autenticación y Correcciones Móviles
**Estado:** ✅ Desplegado
- **Recuperación de Contraseña:** Implementado flujo completo.
- **Verificación de Correo:** Envío automático.
- **Login con Celular:** Diagnóstico y corrección.

## 📅 [Fecha Anterior] - v1.2.0 - Features Sociales
**Estado:** ✅ Desplegado
- Comentarios en posts.
- Solicitudes de Colaboración.
