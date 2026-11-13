# Subir Vinctus a TestFlight sin una Mac propia

El workflow existente **iOS native** puede compilar, firmar y subir la app desde
una Mac temporal de GitHub. La subida es manual y solo se ejecuta después de que
pasen la compilación y las pruebas nativas del mismo commit. No envía la app a
revisión de App Store ni la publica para todos los usuarios.

Estado: proceso preparado; firma y subida pendientes de credenciales y validación
con la cuenta de Apple. Una compilación de simulador no prueba estos pasos.

## Configuración en Apple (desde Windows)

1. En [Apple Developer](https://developer.apple.com/account), consulta el **Team ID**
   y comprueba las capacidades del identificador `app.vinctus.social`, incluyendo
   Sign in with Apple y Declared Age Range.
2. En [App Store Connect](https://appstoreconnect.apple.com), comprueba que existe
   la ficha de Vinctus con ese Bundle ID y que los acuerdos están aceptados.
3. En **Users and Access > Integrations > App Store Connect API > Team Keys**,
   crea una clave de equipo con permiso para certificados, perfiles y distribución
   en la nube. Admin tiene acceso a firma en la nube por defecto. Guarda el archivo
   `.p8`, el **Key ID** y el **Issuer ID**. La clave de Sign in with Apple que usa
   Firebase es distinta y no sirve para este proceso.

Xcode usa la API para gestionar los certificados y perfiles necesarios. Los
límites de certificados y las capacidades autorizadas por Apple pueden requerir
un ajuste en el portal; la primera ejecución debe comprobarse.

## Configuración en GitHub

El entorno **ios-release** ya se creó en **Settings > Environments**, con revisión
del propietario y ramas limitadas a `main` y `fix/ios-conversations`. La
configuración Firebase ya está cargada. Faltan los cuatro valores de Apple:

| Secreto                     | Valor                                            |
| --------------------------- | ------------------------------------------------ |
| `APPLE_TEAM_ID`             | Team ID de Apple Developer                       |
| `ASC_KEY_ID`                | Key ID de la clave de equipo                     |
| `ASC_ISSUER_ID`             | Issuer ID de App Store Connect                   |
| `ASC_PRIVATE_KEY`           | Contenido completo del archivo `.p8`             |
| `IOS_FIREBASE_PLIST_BASE64` | Configuración Firebase Prod codificada en base64 |

Para cargar el archivo Firebase que ya está preparado localmente, desde
PowerShell en la raíz del proyecto, sin mostrar su contenido:

```powershell
$firebasePlist = [IO.File]::ReadAllBytes((Join-Path (Get-Location) 'ios-native/VinctusNative/Resources/Firebase/GoogleService-Info-Prod.plist'))
[Convert]::ToBase64String($firebasePlist) | gh secret set IOS_FIREBASE_PLIST_BASE64 --env ios-release --repo vicenzoscavino1999/vinctus
```

Carga la clave privada directamente en GitHub o mediante `gh secret set` leyendo
el archivo; no la pegues en una conversación ni la agregues al repositorio.

## Ejecución

Ejemplo desde Windows, una vez subido el workflow y configurado el entorno:

```powershell
gh workflow run ios-native.yml --repo vicenzoscavino1999/vinctus --ref fix/ios-conversations -f upload_to_testflight=true -f build_number=2
```

Sustituye `2` por un build nuevo mayor que los existentes para la versión
`1.0.0`. Revisa y aprueba el commit exacto en el entorno `ios-release`.
La clave privada se escribe solo en la Mac temporal y se elimina al terminar;
el workflow no sube archivos de configuración ni credenciales como artefactos.

Cuando Apple termine de procesar el build, agrégalo a tu grupo interno de
TestFlight e instálalo en el iPhone. Valida los cuatro puntos de
`docs/revision-app-nativa.md`: voz audible y grabación, videos de la fototeca,
interrupciones/salida de audio y permisos de Safari. La reproducción en un
simulador no sustituye esa comprobación.

Referencias: [firma en la nube de Apple](https://developer.apple.com/videos/play/wwdc2021/10204/)
y [subida de builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/).
