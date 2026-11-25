# Borrador de privacidad y clasificación por edad para Vinctus

Actualizado el 23 de noviembre de 2026. Las respuestas definitivas se confirman en App Store Connect con el binario de producción.

## Datos de la app iOS

El [manifiesto de la app](../ios-native/VinctusNative/Resources/PrivacyInfo.xcprivacy) declara los datos siguientes, vinculados a la cuenta y usados para ofrecer las funciones de Vinctus.

| Datos                                    | Uso en Vinctus                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Nombre, correo e ID de usuario           | Autenticación y perfil                                                             |
| Ubicación aproximada                     | Ciudad y país opcionales que la persona escribe en su perfil                       |
| Contactos del grafo social               | Relaciones de seguimiento, amistades y conexiones dentro de Vinctus                |
| Mensajes de texto, fotos, videos y audio | Conversaciones, publicaciones, historias y notas de voz                            |
| Otro contenido del usuario               | Biografía, comentarios, archivos, colecciones, reportes y contenido de IA guardado |
| Interacción con el producto              | Reacciones y otros estados de uso asociados a la cuenta                            |

No se identificó seguimiento publicitario en el código de la app iOS. Antes de completar las etiquetas, generar el informe de privacidad del archivo firmado en Xcode y contrastarlo con los SDK efectivamente incluidos, Firebase, el backend y los proveedores de IA activos. Revisar si algún proveedor conserva datos después de procesar la solicitud y declarar los datos que corresponda. Este inventario debe reflejar la versión final.

El manifiesto declara el uso de preferencias locales para recordar la aceptación de términos y de metadatos de archivos para validar adjuntos elegidos por la persona o guardados en el contenedor de la app. El flujo de distribución comprueba que el archivo firmado contenga el manifiesto. [Etiquetas de Apple](https://developer.apple.com/app-store/app-privacy-details/) · [Manifiestos de Apple](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)

## Clasificación por edad

- Declarar la capacidad de red social, el contenido generado por usuarios y la mensajería. Responder sobre las funciones y el contenido disponibles en la compilación que se envía.
- Registrar los controles de seguridad que realmente funcionan. Para declarar que la red social está deshabilitada para menores de 13 años, validar antes el comportamiento del control de edad. En el código actual, la consulta de rango depende de iOS 26.2 o posterior y de la elegibilidad indicada por Apple. La espera de elegibilidad también tiene un límite de tiempo.
- Evaluar ubicación compartida según las capacidades reales. El campo opcional de ciudad y país del perfil debe considerarse al responder.
- Dejar que el cuestionario determine la clasificación y revisar el resultado de cada territorio seleccionado.

[Definiciones de edad de Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)
