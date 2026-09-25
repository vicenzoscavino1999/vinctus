# Guia: publicar Vinctus (app nativa) en el App Store

Esta guia es para compilar la app nativa (`ios-native/VinctusNative`) en una Mac, probarla con TestFlight y enviarla a revision de Apple.

> La app de Capacitor (`ios/`) no se debe publicar. En esa app, el inicio de sesion con Google y Apple no funciona. Ademas, Apple suele rechazar apps que solo muestran una web (regla 4.2).

## Lo que necesitas

- Una Mac con la ultima version de **Xcode** (se instala desde la Mac App Store).
- Una cuenta del **Apple Developer Program** (99 USD al año) con acceso a [App Store Connect](https://appstoreconnect.apple.com).
- Acceso a la **consola de Firebase** del proyecto `vinctus-daf32`.
- **Homebrew** ([brew.sh](https://brew.sh)), para instalar XcodeGen.
- Un iPhone para probar. Es opcional, pero recomendado.

## 1. Descargar el proyecto

En la app Terminal de la Mac:

```bash
git clone https://github.com/vicenzoscavino1999/vinctus.git
cd vinctus/ios-native/VinctusNative
```

## 2. Configuracion de Firebase

Estos archivos no estan en GitHub a proposito.

1. En la consola de Firebase, ve a **Configuracion del proyecto** y luego a **Tus apps**.
2. Busca la app de iOS con el ID de paquete `app.vinctus.social`. Si no existe, crea una con **Agregar app > iOS** y ese mismo ID.
3. Descarga `GoogleService-Info.plist` y guardalo con este nombre exacto:

   ```
   ios-native/VinctusNative/Resources/Firebase/GoogleService-Info-Prod.plist
   ```

   Si tambien vas a usar los esquemas Dev o Staging, guarda sus archivos como `GoogleService-Info-Dev.plist` y `GoogleService-Info-Staging.plist`.

4. Configura el inicio de sesion con Google. Este comando copia el identificador del archivo anterior:

   ```bash
   echo "GOOGLE_REVERSED_CLIENT_ID = $(/usr/libexec/PlistBuddy -c 'Print :REVERSED_CLIENT_ID' Resources/Firebase/GoogleService-Info-Prod.plist)" > Config/Prod.local.xcconfig
   ```

   El archivo `Config/Prod.local.xcconfig` deberia quedar asi:
   `GOOGLE_REVERSED_CLIENT_ID = com.googleusercontent.apps.659504934382-4hlkifq68ak7ugo2p4fd0828j48ag9mg`

## 3. Generar y abrir el proyecto

```bash
brew install xcodegen
xcodegen generate
open VinctusNative.xcodeproj
```

En Xcode, abre el target **VinctusNative** y la pestaña **Signing & Capabilities**:

- **Team**: tu equipo de Apple Developer.
- **Bundle Identifier**: `app.vinctus.social`.
- **Sign in with Apple** ya viene activado en `Resources/VinctusNative.entitlements`.

## 4. Probar la app

1. Elige el esquema **VinctusNative-Prod** y un simulador o tu iPhone, y presiona ▶︎ (Run).
2. Revisa que funcione:
   - [ ] Iniciar sesion con Google, con Apple y con email.
   - [ ] Ver el feed, abrir una publicacion y comentar.
   - [ ] **Denunciar**: el menu **···** de una publicacion, de un comentario o de un perfil permite enviar una denuncia.
   - [ ] **Bloquear**: desde el mismo menu. Las publicaciones y comentarios de esa persona desaparecen.
   - [ ] **Desbloquear**: en **Perfil > Ajustes > Usuarios bloqueados**.
   - [ ] **Eliminar cuenta**: en **Ajustes > Zona de riesgo**. Pruebalo con una cuenta de prueba.

> Estos cambios se escribieron sin poder compilar, porque Xcode solo funciona en Mac. Si Xcode muestra algun error, copia el mensaje exacto (o una captura) y mandalo para corregirlo.

## 5. Publicar las reglas de Firestore

Hazlo una sola vez, desde la raiz del repositorio, despues de fusionar los cambios:

```bash
firebase deploy --only firestore:rules --project vinctus-daf32
```

Este paso permite que, al bloquear a alguien, tambien se borre su "seguimiento" hacia ti. Sin este paso, el bloqueo igual funciona.

## 6. Crear la app en App Store Connect

- Si ya existe una app con el ID `app.vinctus.social` (por ejemplo, de la version de Capacitor), usa esa misma ficha y crea una version nueva.
- Si no existe, crea una nueva en **Apps > + > Nueva app**:
  - Plataforma: iOS.
  - Nombre: Vinctus.
  - Idioma principal: Español.
  - ID de paquete: `app.vinctus.social`.
  - SKU: por ejemplo `vinctus-ios`.

## 7. Subir la version (Archive)

1. Ajusta el numero de version en `project.yml`: `MARKETING_VERSION` (por ejemplo `1.0.0`) y `CURRENT_PROJECT_VERSION`. `CURRENT_PROJECT_VERSION` debe subir de 1 en 1 con cada archivo que subas. Despues ejecuta `xcodegen generate` otra vez.
2. En Xcode, ve a **Product > Scheme > Edit Scheme > Archive** y en **Build Configuration** elige **ReleaseProd**. En esa configuracion no aparecen las opciones de prueba del programador.
3. Elige **Any iOS Device (arm64)** como destino.
4. Ve a **Product > Archive**. Cuando termine, se abre el **Organizer**.
5. Toca **Distribute App > App Store Connect > Upload**.

## 8. TestFlight

- El build tarda unos minutos en procesarse en App Store Connect.
- Si pregunta por cifrado: la app solo usa HTTPS normal, que es el caso "exento". Para no ver la pregunta en cada build, se puede agregar `ITSAppUsesNonExemptEncryption = NO` al `Info.plist`.
- Agregate como probador en **TestFlight** e instala la app en tu iPhone con la app TestFlight.

## 9. Enviar a revision

Completa la ficha en App Store Connect:

- **Capturas de pantalla** de iPhone (Apple indica los tamaños requeridos).
- **Descripcion**, palabras clave y categoria (por ejemplo, Redes sociales).
- **URL de soporte**: `https://vinctus.vercel.app/support.html`
- **Politica de privacidad**: `https://vinctus.vercel.app/privacy.html`
- **Privacidad de la app**: declara que se recopilan email, nombre, contenido del usuario e identificadores, vinculados a la cuenta y usados para el funcionamiento de la app. Declara tambien que los mensajes a la IA se envian a Google Gemini y NVIDIA.
- **Clasificacion por edad**: responde que la app tiene contenido generado por usuarios.
- **Informacion para la revision**:
  - Crea una **cuenta de prueba con email y contraseña** en Firebase Authentication y escribe sus datos. Los revisores no pueden usar tu cuenta de Google.
  - En las notas, explica donde estan las funciones que Apple revisa en apps sociales:
    - Denunciar: menu ··· en publicaciones, comentarios y perfiles.
    - Bloquear: el mismo menu. Desbloquear: Ajustes > Usuarios bloqueados.
    - Eliminar cuenta: Ajustes > Zona de riesgo.
    - Terminos: se aceptan en la pantalla de inicio de sesion.

## Lo que Apple revisa y como lo cubre la app

| Regla                        | Que pide                                             | Estado                                                                                                                    |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1.2 Contenido de usuarios    | Denunciar contenido                                  | ✅ Menu ··· en publicaciones, comentarios y perfiles. Las denuncias llegan a la cola de moderacion.                       |
| 1.2 Contenido de usuarios    | Bloquear usuarios                                    | ✅ Menu ···, y lista de bloqueados en Ajustes.                                                                            |
| 1.2 Contenido de usuarios    | Aceptar terminos sin tolerancia a contenido ofensivo | ✅ Texto y enlaces en la pantalla de inicio de sesion.                                                                    |
| 1.2 Contenido de usuarios    | Contacto publicado                                   | ✅ Ajustes > Legal y soporte.                                                                                             |
| 1.2 Contenido de usuarios    | Responder denuncias a tiempo                         | ⚠️ Depende del equipo: revisa la cola de moderacion en la web (el objetivo que suele esperar Apple es menos de 24 horas). |
| 2.1 / 2.3 App completa       | Nada de pantallas de prueba                          | ✅ Las opciones de prueba solo aparecen en builds Debug.                                                                  |
| 4.8 Iniciar sesion con Apple | Obligatorio si hay Google                            | ✅                                                                                                                        |
| 5.1.1(v) Eliminar cuenta     | Desde la app                                         | ✅ Ajustes > Zona de riesgo.                                                                                              |
| 5.1.2 IA de terceros         | Avisar y pedir permiso                               | ✅ Consentimiento de IA en Ajustes.                                                                                       |
