# Guia: publicar Vinctus (app nativa) en el App Store

Esta guia es para compilar la app nativa (`ios-native/VinctusNative`) en una Mac, probarla con TestFlight y enviarla a revision de Apple.

> **Sin Mac:** cada cambio en `ios-native/` se compila y se prueba solo en una Mac de GitHub (workflow **iOS native** en la pestaña Actions del repositorio). Asi se detectan errores de Swift sin tener una Mac. Para _subir_ la app a Apple si hace falta una Mac (propia, alquilada en la nube o un servicio de CI con firma).

> La app de Capacitor (`ios/`) no se debe publicar. En esa app, el inicio de sesion con Google y Apple no funciona. Ademas, Apple suele rechazar apps que solo muestran una web (regla 4.2).

## Lo que necesitas

- Una Mac con **Xcode 26** o mas nuevo (se instala desde la Mac App Store). Desde el 28 de abril de 2026, Apple solo acepta builds hechos con Xcode 26.
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
- **Declared Age Range** (verificación de edad para leyes de EE. UU.) también viene en ese archivo. Si Xcode dice que el perfil no incluye esa capacidad, actívala en developer.apple.com > Identifiers > `app.vinctus.social`.

## 4. Probar la app

1. Elige el esquema **VinctusNative-Prod** y un simulador o tu iPhone, y presiona ▶︎ (Run).
2. Revisa que funcione:
   - [ ] La casilla **"Acepto los Terminos..."** activa los botones de inicio de sesion.
   - [ ] Iniciar sesion con Google, con Apple y con email.
   - [ ] Ver el feed, dar **me gusta**, abrir una publicacion y comentar.
   - [ ] **Seguir / dejar de seguir** desde el perfil de otra persona.
   - [ ] **Denunciar**: el menu **···** de una publicacion, de un comentario o de un perfil permite enviar una denuncia.
   - [ ] **Bloquear**: desde el mismo menu. Las publicaciones, comentarios y sugerencias de esa persona desaparecen.
   - [ ] **Desbloquear**: en **Perfil > Ajustes > Usuarios bloqueados**.
   - [ ] **Eliminar cuenta**: en **Ajustes > Zona de riesgo**. Pruebalo con una cuenta de prueba. Si la cuenta es de Apple, la app pide confirmar con Apple.
   - [ ] El icono aparece y el nombre bajo el icono es **Vinctus**.
   - [ ] En IA, el enlace **Denunciar respuesta** abre el formulario de denuncia.
   - [ ] **IA**: en **Descubrir > Inteligencia artificial**, abre Chat con IA y Arena IA. La primera vez pide permiso; despues responde. El permiso se retira en **Ajustes > IA**.

## 5. Publicar las funciones, las reglas y las paginas legales

Hazlo desde la raiz del repositorio, despues de fusionar los cambios en `main`:

```bash
npm --prefix functions install
firebase deploy --only functions,firestore:rules --project vinctus-daf32
```

- **Funciones**: el filtro de contenido ampliado (publicaciones, comentarios, perfiles y grupos) y las acciones del panel de moderacion (eliminar contenido y suspender usuarios).
- **Reglas**: permiten que, al bloquear a alguien, tambien se borre su "seguimiento" hacia ti.
- **Paginas legales** (`public/privacy.html`, `terms.html`, `community-guidelines.html`, `support.html`): se publican con la web en Vercel al fusionar en `main`. Revisa que se vean en `https://vinctus.vercel.app/privacy.html`.

## 6. Configurar la revocacion de "Iniciar sesion con Apple"

Apple pide que, al eliminar una cuenta creada con Apple, la app revoque el acceso a ese Apple ID. La app ya lo hace, pero Firebase necesita que el proveedor Apple tenga **todos** sus campos completos, aunque la consola diga que son opcionales:

1. En la consola de Firebase, abre **Authentication > Sign-in method > Apple**.
2. Revisa que esten completos **Services ID** y la seccion **OAuth code flow configuration** (Apple Team ID, Key ID y la clave privada `.p8`).
3. Si falta alguno, sigue los pasos 2 a 4 de [`docs/apple-sign-in-setup.md`](../../docs/apple-sign-in-setup.md) para crear el Services ID y la clave en developer.apple.com.

Si falta este paso, la cuenta igual se elimina, pero el acceso a Apple no se revoca.

## 7. Crear la app en App Store Connect

- Si ya existe una app con el ID `app.vinctus.social` (por ejemplo, de la version de Capacitor), usa esa misma ficha y crea una version nueva.
- Si no existe, crea una nueva en **Apps > + > Nueva app**:
  - Plataforma: iOS.
  - Nombre: Vinctus.
  - Idioma principal: Español.
  - ID de paquete: `app.vinctus.social`.
  - SKU: por ejemplo `vinctus-ios`.

## 8. Subir la version (Archive)

1. La version ya esta en `1.0.0` en `project.yml` (`MARKETING_VERSION`). `CURRENT_PROJECT_VERSION` debe subir de 1 en 1 con cada build que subas. Despues ejecuta `xcodegen generate` otra vez.
2. En Xcode, ve a **Product > Scheme > Edit Scheme > Archive** y en **Build Configuration** elige **ReleaseProd**. En esa configuracion no aparecen las opciones de prueba del programador.
3. Elige **Any iOS Device (arm64)** como destino.
4. Ve a **Product > Archive**. Cuando termine, se abre el **Organizer**.
5. Toca **Distribute App > App Store Connect > Upload**.

La app es solo para iPhone, asi que no hacen falta capturas de iPad.

## 9. TestFlight

- El build tarda unos minutos en procesarse en App Store Connect.
- La pregunta de cifrado ya no aparece: el `Info.plist` declara `ITSAppUsesNonExemptEncryption = NO` (la app solo usa HTTPS normal).
- Agregate como probador en **TestFlight** e instala la app en tu iPhone con la app TestFlight.

## 10. Enviar a revision

Completa la ficha en App Store Connect:

- **Capturas de pantalla** de iPhone (Apple indica los tamaños requeridos).
- **Descripcion**, palabras clave y categoria (por ejemplo, Redes sociales).
- **URL de soporte**: `https://vinctus.vercel.app/support.html`
- **Politica de privacidad**: `https://vinctus.vercel.app/privacy.html`
- **Privacidad de la app** (etiquetas de privacidad): declara **correo electronico**, **nombre**, **contenido del usuario** (publicaciones, comentarios, perfil) e **ID de usuario**, todos vinculados a la cuenta, usados para el **funcionamiento de la app** y **sin rastreo**. Declara tambien que el **contenido del usuario** que se escribe en Chat con IA y Arena IA se comparte con terceros (Google Gemini y NVIDIA) para el funcionamiento de la app, solo con el permiso del usuario.
- **Clasificacion por edad**: responde el cuestionario completo, que desde septiembre de 2026 es obligatorio e incluye preguntas de **redes sociales**. Vinctus tiene un feed de contenido de usuarios, asi que responde que **si tiene capacidades de red social** y **contenido generado por usuarios**. El resultado sera 13+ como minimo.
- **Paises**: Australia prohibe las redes sociales a menores de 16 años. Lo mas simple es no publicar alli por ahora (**Precios y disponibilidad**). Si la publicas en la Union Europea, completa el estado de **comerciante (DSA)** en **Negocios**.
- **Informacion para la revision**:
  - Crea en produccion una **cuenta de prueba con email y contraseña** y escribe sus datos. Los revisores no pueden usar tu cuenta de Google.
  - Crea tambien **publicaciones y comentarios desde otra cuenta**, para que el revisor pueda denunciar y bloquear a alguien.
  - En las notas, explica donde estan las funciones que Apple revisa en apps sociales:
    - Terminos: se aceptan con una casilla en la pantalla de inicio de sesion, antes de cualquier opcion para entrar.
    - Filtro: un filtro automatico en el servidor retira publicaciones y comentarios con contenido ofensivo, y marca perfiles y grupos para revision.
    - Denunciar: menu ··· en publicaciones, comentarios y perfiles. Las denuncias llegan a un panel de moderacion donde el equipo elimina el contenido y suspende al autor en menos de 24 horas.
    - Bloquear: el mismo menu. El contenido del usuario bloqueado desaparece al instante. Desbloquear: Ajustes > Usuarios bloqueados.
    - Eliminar cuenta: Ajustes > Zona de riesgo. En cuentas de Apple, tambien se revoca el acceso a Apple.
    - IA: Descubrir > Inteligencia artificial (Chat con IA y Arena IA). Antes del primer uso, la app explica que los mensajes se envian a Google Gemini y NVIDIA y pide permiso. El permiso se retira en Ajustes > IA.

## Lo que Apple revisa y como lo cubre la app

| Regla                        | Que pide                                             | Estado                                                                                                         |
| ---------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1.2 Contenido de usuarios    | Filtrar contenido ofensivo                           | ✅ Filtro en el servidor para publicaciones y comentarios (se eliminan) y para perfiles y grupos (se marcan).  |
| 1.2 Contenido de usuarios    | Denunciar contenido                                  | ✅ Menu ··· en publicaciones, comentarios y perfiles. Las denuncias llegan a la cola de moderacion.            |
| 1.2 Contenido de usuarios    | Actuar en 24 horas: borrar contenido y expulsar      | ✅ Panel `/moderation`: eliminar contenido y suspender usuario. ⚠️ Alguien del equipo debe revisarlo cada dia. |
| 1.2 Contenido de usuarios    | Bloquear usuarios                                    | ✅ Menu ···, y lista de bloqueados en Ajustes. Tambien se ocultan en Descubrir y Buscar.                       |
| 1.2 Contenido de usuarios    | Aceptar terminos sin tolerancia a contenido ofensivo | ✅ Casilla obligatoria en la pantalla de inicio de sesion. Los terminos lo dicen de forma explicita.           |
| 1.2 Contenido de usuarios    | Contacto publicado                                   | ✅ Ajustes > Legal y soporte. ⚠️ Comprueba que `support@vinctus.app` y `security@vinctus.app` reciban correos. |
| 2.1 App completa             | Nada de textos o pantallas de prueba                 | ✅ Las opciones de prueba solo aparecen en builds Debug.                                                       |
| 2.1 App completa             | Icono                                                | ✅ `Resources/Assets.xcassets/AppIcon.appiconset`.                                                             |
| 2.3.6 Clasificacion por edad | Responder el cuestionario (incluye redes sociales)   | ⚠️ Se hace en App Store Connect (paso 10).                                                                     |
| 4.8 Iniciar sesion con Apple | Obligatorio si hay Google                            | ✅                                                                                                             |
| 5.1.1(i) Privacidad          | Politica completa, enlazada en la app y en la ficha  | ✅ `public/privacy.html`: datos, terceros, retencion y como retirar el consentimiento.                         |
| 5.1.1(v) Eliminar cuenta     | Desde la app, y revocar el token de Apple            | ✅ Ajustes > Zona de riesgo. ⚠️ La revocacion necesita el paso 6.                                              |
| 5.1.2(i) IA de terceros      | Avisar y pedir permiso antes de enviar datos a IA    | ✅ Pantalla de permiso antes del primer uso de Chat con IA o Arena IA. Se retira en Ajustes > IA.              |
