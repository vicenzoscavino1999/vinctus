# Subir Vinctus a TestFlight sin una Mac propia

El workflow existente **iOS native** puede compilar, firmar y subir la app desde
una Mac temporal de GitHub. La subida es manual y requiere pruebas nativas
aprobadas para el mismo código de la app. No envía la app a
revisión de App Store ni la publica para todos los usuarios.

Estado verificado el 13 de noviembre de 2026: **Vinctus 1.0.0 (2)** archivada,
firmada y subida desde GitHub. Apple terminó el procesamiento (`VALID`) y la
marcó `READY_FOR_BETA_TESTING`. Está asignada al grupo interno **Vinctus QA**,
con notas de prueba en español. La instalación y prueba física siguen pendientes.

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

La firma usa un certificado Apple Distribution y un perfil de App Store ya
preparados. El perfil incluye Sign in with Apple y Declared Age Range. Al usar
distribución, no hace falta registrar el UDID de un iPhone para archivar la app.
El intento inicial con firma automática buscó un perfil de desarrollo y falló
porque la cuenta no tenía dispositivos registrados.
La configuración de firma se aplica únicamente al target `VinctusNative`, en
`ReleaseProd`, mediante un spec temporal de XcodeGen.

## Configuración en GitHub

El entorno **ios-release** ya se creó en **Settings > Environments**, con revisión
del propietario y ramas limitadas a `main` y `fix/ios-conversations`. La
configuración Firebase, los cuatro valores de Apple y los tres secretos de firma
de distribución ya están cargados:

| Secreto                           | Valor                                                                |
| --------------------------------- | -------------------------------------------------------------------- |
| `APPLE_TEAM_ID`                   | Team ID de Apple Developer                                           |
| `ASC_KEY_ID`                      | Key ID de la clave de equipo                                         |
| `ASC_ISSUER_ID`                   | Issuer ID de App Store Connect                                       |
| `ASC_PRIVATE_KEY`                 | Contenido completo del archivo `.p8`                                 |
| `IOS_FIREBASE_PLIST_BASE64`       | Configuración Firebase Prod codificada en base64                     |
| `IOS_DISTRIBUTION_P12_BASE64`     | Certificado y clave de distribución en PKCS12, codificados en base64 |
| `IOS_DISTRIBUTION_P12_PASSWORD`   | Contraseña del contenedor PKCS12                                     |
| `IOS_PROVISIONING_PROFILE_BASE64` | Perfil de App Store de Vinctus, codificado en base64                 |

Los archivos de firma se conservan fuera del repositorio, en
`C:\Users\ASROCK\AppleKeys\Vinctus`. La Mac temporal importa el certificado a
un llavero propio, comprueba que coincide con el perfil y usa firma manual de
distribución. El llavero y los archivos privados temporales se eliminan al terminar.

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

Para una corrección exclusiva del script de publicación, se puede añadir
`-f validated_test_run=43407892324`. El workflow verifica por API que compilación
y pruebas nativas de esa ejecución pasaron, que el commit es un ancestro y que
los archivos nativos, contrato compartido, reglas, configuración de Firebase y
definiciones de pruebas siguen idénticos. Si algo cambió, rechaza esa evidencia
y se debe ejecutar la modalidad normal con todas las pruebas. La firma y subida
siempre se ejecutan de nuevo sobre el commit solicitado.

Las claves privadas se escriben solo en la Mac temporal y se eliminan al terminar;
el workflow no sube archivos de configuración ni credenciales como artefactos.

El build 2 ya está procesado y asignado al grupo **Vinctus QA**, y la cuenta
autorizada por el propietario ya está agregada como probador interno. Apple
confirmó la invitación como `INVITED`. Abre el correo en el iPhone y usa la app
TestFlight para aceptar e instalar Vinctus.
Valida los cuatro puntos de
`docs/revision-app-nativa.md`: voz audible y grabación, videos de la fototeca,
interrupciones/salida de audio y permisos de Safari. La reproducción en un
simulador no sustituye esa comprobación.

Referencias: [perfil de distribución App Store](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile)
y [subida de builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/).
