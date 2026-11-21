# Proyecto Parcial 2 · Gestión de inventario

Panel web servido por Express junto con la API REST. El usuario administrador se configura por entorno. Los registros del módulo Usuarios son los que ya gestionaba la API del integrador. Productos guarda nombre, precio en MXN y existencias en SQLite.

## Ejecutar en Windows

Desde la carpeta `parcial2`, con Node.js 22:

```powershell
npm.cmd ci
Copy-Item .env.example .env
# Abre .env y escribe una contraseña de administración local.
node --env-file=.env index.js
```

Abre [http://localhost:3000](http://localhost:3000) e inicia sesión con los valores de `.env`. Los cambios se guardan en `data.db`. Si quieres probar con datos anteriores, usa una copia de la base existente y configura `DB_PATH`. Al iniciar se crean las tablas que hagan falta.

## Pruebas

```powershell
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Si tienes Edge instalado, puedes sustituir la instalación de Chromium con `$env:PLAYWRIGHT_CHANNEL='msedge'`. Jest y Playwright usan bases SQLite en memoria. Playwright arranca la aplicación local y genera el informe en `playwright-report/index.html`.

## API

Las rutas de usuarios y productos requieren la cookie de sesión que emite `POST /api/login`. `GET /api/session` consulta la sesión y `POST /api/logout` la revoca.

| Ruta | Métodos | Datos de escritura |
| --- | --- | --- |
| /api/users | GET, POST | `name`, `email` |
| /api/users/:id | GET, PUT, DELETE | `name`, `email` |
| /api/products | GET, POST | `name`, `priceCents`, `stock` |
| /api/products/:id | GET, PUT, DELETE | `name`, `priceCents`, `stock` |
| /api/health | GET | Consulta pública de salud y versión |

## GitHub Actions y EC2

Coloca el contenido de esta carpeta en la raíz del repositorio. El flujo ejecuta Jest y Playwright antes de publicar la imagen y desplegarla. Para reutilizar la EC2, configura los secretos del workflow y crea `~/backend-api-deploy/application.env` en el servidor con `ADMIN_USER` y `ADMIN_PASSWORD`. Restringe los permisos del archivo al usuario de despliegue. El contenedor en producción emite cookies seguras, por lo que la URL que abra el navegador debe usar HTTPS. El proxy heredado escucha en el puerto 80 y requiere un punto de entrada HTTPS para publicar el login. Consulta [la configuración de OpenObserve](observability/README.md) para conectar el pipeline, la aplicación y las métricas del servidor.
