# Conectar Biblioluch con Supabase

La biblioteca personal de PDFs usa Supabase Auth, una tabla con políticas RLS y un bucket privado de Storage. Los libros nuevos pertenecen a la cuenta que los subió. La tabla incluye `is_shared` para poder agregar una biblioteca compartida después; por ahora no hay una pantalla para publicar ni compartir libros.

## Preparar el proyecto

1. Abre el proyecto de Supabase que ya creaste.
2. En **SQL Editor**, ejecuta el contenido de [`supabase/setup.sql`](./supabase/setup.sql). Esto crea `public.libros_pdf`, sus políticas de acceso y el bucket privado `libros-pdf`.
3. En **Authentication → Providers → Email**, habilita correo y contraseña. Configura también las URLs de redirección de tu sitio publicado en **Authentication → URL Configuration**.
4. El Project URL y la clave pública **publishable** ya están guardados en [`js/supabase-config.js`](./js/supabase-config.js). Para cambiar o renovar la clave, edita ese archivo con los valores de **Project Settings → API**.
5. Nunca uses ni publiques `service_role` o una clave `sb_secret_...` en el navegador, en `js/supabase-config.js` ni en Git. Si una operación futura requiere una clave secreta, debe ejecutarse exclusivamente en un backend con variables de entorno privadas.

6. Publica los cambios de la aplicación. La URL y clave publishable se usan en el navegador; la seguridad de los datos depende de las políticas RLS del SQL, no de ocultar la clave pública.

## Publicar en Cloudflare Workers

El sitio es estático y sus PDFs personales viven en Supabase. El archivo [`.assetsignore`](./.assetsignore) impide que Cloudflare publique `node_modules` (que puede contener el binario `workerd`), la carpeta local `LIBROS PDF` y archivos de configuración/servidor que no son recursos de la web. Mantén `node_modules/` también en `.gitignore`; no cambies el directorio de recursos de Workers a la raíz sin conservar estas exclusiones.

## Uso y límites

- Los libros importados se suben al bucket privado y cada usuario solo ve/renombra/elimina sus propios libros.
- Para el flujo de confirmación de correo, cada persona debe confirmar su cuenta antes de iniciar sesión si la confirmación está habilitada en el proyecto.
- El cliente limita las cargas a 50 MB y el bucket se configura con el mismo límite. Puedes ajustarlo en Supabase Storage si tu proyecto lo permite.
- La app local continúa usando el servidor local cuando no hay credenciales configuradas. La versión en GitHub Pages necesita la configuración de Supabase para guardar PDFs; GitHub Pages por sí solo no almacena archivos.
- Para una futura sección de libros compartidos, la tabla y las políticas ya contemplan `is_shared`; deberá añadirse una acción explícita para compartir y una vista separada. Los libros no se comparten automáticamente.
- La clave secreta del proyecto no es necesaria para la app del navegador. Si la compartiste fuera de Supabase, rótala desde el panel del proyecto antes de desplegar.
