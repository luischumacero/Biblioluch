# Conectar Biblioluch con Supabase

La biblioteca personal y la sección COMUNIDAD usan Supabase Auth, políticas RLS y buckets privados. Los PDFs comunitarios solo son visibles para miembros del grupo al que fueron subidos.

## Preparar el proyecto

1. Abre el proyecto de Supabase que ya creaste.
2. En **SQL Editor**, ejecuta el contenido actualizado de [`supabase/setup.sql`](./supabase/setup.sql). Esto crea las tablas y políticas de la biblioteca personal y de COMUNIDAD, además de los buckets privados `libros-pdf` y `comunidad-pdf`. Si ya ejecutaste una versión anterior, vuelve a ejecutar este archivo para aplicar las tablas, funciones y políticas comunitarias.
3. En **Authentication → Providers → Email**, habilita correo y contraseña. En **Authentication → URL Configuration**:
   - En **Site URL**, coloca la URL real de tu aplicación publicada en Cloudflare, por ejemplo `https://biblioluch.<tu-cuenta>.workers.dev` (usa el dominio que aparece al abrir la web; no `github.io`).
   - En **Redirect URLs**, agrega esa misma dirección y `http://localhost:8080/**` para pruebas locales. La aplicación solicita redirigir la confirmación al mismo origen desde el que se creó la cuenta, así que todo dominio/preview que utilices debe estar permitido aquí.
4. El Project URL y la clave pública **publishable** ya están guardados en [`js/supabase-config.js`](./js/supabase-config.js). Para cambiar o renovar la clave, edita ese archivo con los valores de **Project Settings → API**.
5. Nunca uses ni publiques `service_role` o una clave `sb_secret_...` en el navegador, en `js/supabase-config.js` ni en Git. Si una operación futura requiere una clave secreta, debe ejecutarse exclusivamente en un backend con variables de entorno privadas.

6. Publica los cambios de la aplicación. La URL y clave publishable se usan en el navegador; la seguridad de los datos depende de las políticas RLS del SQL, no de ocultar la clave pública.

## Publicar en Cloudflare Workers

El sitio es estático y sus PDFs personales viven en Supabase. El archivo [`.assetsignore`](./.assetsignore) impide que Cloudflare publique `node_modules` (que puede contener el binario `workerd`), la carpeta local `LIBROS PDF` y archivos de configuración/servidor que no son recursos de la web. Mantén `node_modules/` también en `.gitignore`; no cambies el directorio de recursos de Workers a la raíz sin conservar estas exclusiones.

## Uso y límites

- Con Supabase configurado, el inicio de sesión es requisito para entrar al sitio. Al cerrar sesión se vuelve a la pantalla de acceso; la versión local sin configuración de Supabase conserva el acceso actual.
- Los libros importados se suben al bucket privado y cada usuario solo ve/renombra/elimina sus propios libros.
- En **COMUNIDAD**, cualquier usuario con sesión puede crear un grupo y compartir su código de ingreso. Otros usuarios autenticados se unen con ese código. Los miembros pueden ver, abrir y generar preguntas sobre los PDFs del grupo; solo quien subió un PDF puede eliminarlo.
- Los archivos comunitarios se guardan en el bucket privado `comunidad-pdf`; las políticas RLS verifican la membresía tanto para la tabla como para Storage. No hagas público ese bucket ni añadas claves secretas al frontend.
- Para el flujo de confirmación de correo, cada persona debe confirmar su cuenta antes de iniciar sesión si la confirmación está habilitada en el proyecto.
- Si un correo de confirmación ya enviado abre el antiguo 404 de GitHub Pages, cambiar el código no modifica ese enlace ya generado: actualiza **Site URL** y **Redirect URLs** y vuelve a enviar la confirmación (o crea una cuenta nueva para probar). Los siguientes correos usarán el dominio actual de la aplicación.
- El cliente limita las cargas a 50 MB y el bucket se configura con el mismo límite. Puedes ajustarlo en Supabase Storage si tu proyecto lo permite.
- La app local continúa usando el servidor local cuando no hay credenciales configuradas. La versión en GitHub Pages necesita la configuración de Supabase para guardar PDFs; GitHub Pages por sí solo no almacena archivos.
- La clave secreta del proyecto no es necesaria para la app del navegador. Si la compartiste fuera de Supabase, rótala desde el panel del proyecto antes de desplegar.
