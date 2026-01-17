# Registro de Despliegues - Vinctus

## 📅 [Fecha Actual] - v1.3.0 - Mejoras en Autenticación y Correcciones Móviles
**Estado:** ✅ Desplegado

### 🔒 Autenticación
- **Recuperación de Contraseña:** Implementado flujo completo de "Olvidé mi contraseña".
- **Verificación de Correo:** Envío automático de correo de verificación al registrarse.
- **Login con Celular:** Diagnóstico y corrección de configuración regional en Firebase (User-side).

### 📱 Móvil y PWA (Previo)
- **Safari Fix:** Headers específicos en `vercel.json` para iOS.
- **PWA:** Configuración `minimal-ui` y orientación flexible.
- **Viewport:** Corrección de escala para evitar zoom indeseado.

### 🌐 Infraestructura
- **Reglas Firestore:** Actualizadas para dual-write y nuevas colecciones.
- **Reglas Storage:** Optimizadas.
- **Vercel:** Despliegue automático vía Git.

---

## 📅 [Fecha Anterior] - v1.2.0 - Features Sociales
**Estado:** ✅ Desplegado
- Comentarios en posts.
- Solicitudes de Colaboración.
- Correcciones de UI.
