# Capacitor iOS Setup (Baseline)

Fecha: 2026-02-11

## Implementado en codigo

1. Dependencias instaladas:
   - `@capacitor/core`
   - `@capacitor/cli`
   - `@capacitor/ios`
   - `@capacitor/push-notifications`
   - `@capacitor/camera`
   - `@capacitor/haptics`
2. Configuracion base:
   - `capacitor.config.ts`
3. Scripts npm:
   - `cap:add:ios`
   - `cap:sync`
   - `cap:open:ios`
   - `ios:prepare`
4. Proyecto iOS generado:
   - carpeta `ios/`
5. Wrappers de plugins y UI de prueba en Settings:
   - `src/shared/lib/native/*`
   - `src/features/settings/pages/SettingsPage.tsx`

## Estado del entorno actual

- `cap add ios` y `cap sync` ejecutaron correctamente en este entorno.
- Advertencias esperadas:
  - CocoaPods no instalado.
  - `xcodebuild` no disponible.

## Pendiente manual (Mac/Xcode)

1. Instalar Xcode estable y CocoaPods.
2. Ejecutar `npm run cap:open:ios`.
3. Configurar Team/Signing, Bundle Identifier final y capabilities.
4. Configurar APNs para push notifications.
5. Ajustar `Info.plist` permisos (camera, microphone si aplica, notificaciones).
6. Compilar en dispositivo real y validar flujo push/camera/haptics.
