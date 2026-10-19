# Conectar Biblioluch con Supabase

La biblioteca personal y la sección COMUNIDAD usan Supabase Auth, políticas RLS y buckets privados. Los PDFs comunitarios solo son visibles para miembros del grupo al que fueron subidos.

## Preparar el proyecto

1. Abre el proyecto de Supabase que ya creaste.
2. En **SQL Editor**, ejecuta el contenido actualizado de [`supabase/setup.sql`](./supabase/setup.sql). Esto crea las tablas y políticas de la biblioteca personal, COMUNIDAD, perfiles y mensajería, además de los buckets `libros-pdf`, `comunidad-pdf` y `profile-avatars`. Si ya ejecutaste una versión anterior, vuelve a ejecutar el archivo completo para aplicar las tablas, funciones y políticas nuevas.
3. En **Authentication → Providers → Email**, habilita correo y contraseña. En **Authentication → URL Configuration**:
   - En **Site URL**, coloca la URL pública real de la aplicación (el mismo dominio que visitas para abrir Biblioluch).
   - En **Redirect URLs**, agrega esa URL con `/**` al final y `http://localhost:8080/**` para pruebas locales. Agrega también cada dominio de preview que uses. El registro y la recuperación de contraseña envían al navegador de vuelta a la misma ruta de la aplicación, no a una ruta de callback separada.
4. El Project URL y la clave pública **publishable** ya están guardados en [`js/supabase-config.js`](./js/supabase-config.js). Para cambiar o renovar la clave, edita ese archivo con los valores de **Project Settings → API**.
5. Nunca uses ni publiques `service_role` o una clave `sb_secret_...` en el navegador, en `js/supabase-config.js` ni en Git. Si una operación futura requiere una clave secreta, debe ejecutarse exclusivamente en un backend con variables de entorno privadas.

6. Publica los cambios de la aplicación. La URL y clave publishable se usan en el navegador; la seguridad de los datos depende de las políticas RLS del SQL, no de ocultar la clave pública.

## Publicar en Cloudflare Workers

El sitio es estático y sus PDFs personales viven en Supabase. El archivo [`.assetsignore`](./.assetsignore) impide que Cloudflare publique `node_modules` (que puede contener el binario `workerd`), la carpeta local `LIBROS PDF` y archivos de configuración/servidor que no son recursos de la web. Mantén `node_modules/` también en `.gitignore`; no cambies el directorio de recursos de Workers a la raíz sin conservar estas exclusiones.

## Uso y límites

- Con Supabase configurado, el inicio de sesión es requisito para entrar al sitio. Al cerrar sesión se vuelve a la pantalla de acceso; la versión local sin configuración de Supabase conserva el acceso actual.
- Los libros importados se suben al bucket privado y cada usuario solo ve/renombra/elimina sus propios libros.
- En **COMUNIDAD**, cualquier usuario con sesión puede crear un grupo y compartir su código de ingreso. Otros usuarios autenticados se unen con ese código. Los miembros pueden ver, abrir y generar preguntas sobre los PDFs del grupo; solo quien subió un PDF puede eliminarlo.
- En **Mi perfil**, cada usuario puede editar su nombre de usuario, nombre visible, descripción, institución opcional y foto. Los nombres de usuario deben ser únicos. La búsqueda para iniciar chats se realiza por prefijo del nombre de usuario.
- En **Mensajes**, los usuarios pueden abrir chats privados o crear grupos de estudio. El flujo de crear grupo añade al creador y al menos dos participantes buscados. Los mensajes se transmiten en tiempo real mediante Supabase Realtime; confirma que la tabla `messages` aparezca en la publicación `supabase_realtime` (el SQL intenta añadirla automáticamente).
- Las fotos de perfil se guardan en el bucket público `profile-avatars`; solo la persona dueña puede subir, sustituir o borrar archivos dentro de su carpeta. La política de lectura para la persona dueña permite reemplazar su foto con `upsert`. No guardes información sensible en la descripción o institución del perfil.
- Los archivos comunitarios se guardan en el bucket privado `comunidad-pdf`; las políticas RLS verifican la membresía tanto para la tabla como para Storage. No hagas público ese bucket ni añadas claves secretas al frontend.
- Para personalizar el correo, abre **Authentication → Email Templates → Confirm signup** y edita asunto, texto y HTML con el nombre y logo de Biblioluch. Los campos `{{ .ConfirmationURL }}` y `{{ .SiteURL }}` deben conservarse para que el enlace siga confirmando la cuenta. El nombre del remitente/dominio de envío y la entrega con dominio propio se configuran en **Project Settings → Auth → SMTP Settings**; el frontend no puede reemplazar por sí solo el remitente predeterminado de Supabase.
- Para el flujo de confirmación de correo, cada persona debe confirmar su cuenta antes de iniciar sesión si la confirmación está habilitada en el proyecto.
- Si un correo antiguo abre un 404, cambiar el código no modifica el enlace ya emitido: actualiza **Site URL** y **Redirect URLs**, verifica que la app esté publicada en esa URL y vuelve a enviar la confirmación (o crea una cuenta nueva para probar). Comprueba que el dominio no sea uno antiguo como GitHub Pages si ahora publicas en Cloudflare. Los siguientes correos usarán el destino actualizado.
- El cliente limita las cargas a 50 MB y el bucket se configura con el mismo límite. Puedes ajustarlo en Supabase Storage si tu proyecto lo permite.
- La app local continúa usando el servidor local cuando no hay credenciales configuradas. La versión en GitHub Pages necesita la configuración de Supabase para guardar PDFs; GitHub Pages por sí solo no almacena archivos.
- La clave secreta del proyecto no es necesaria para la app del navegador. Si la compartiste fuera de Supabase, rótala desde el panel del proyecto antes de desplegar.
