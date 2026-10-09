# Backend API — proyecto integrador

API REST con **6 endpoints**: usuarios y salud. Express, SQLite, Jest/Supertest, Docker, GitHub Actions y EC2.

## Ejecutar

Requiere Node 22 y npm.

```powershell
npm ci
npm test -- --verbose --json --outputFile=report/test-results.json
node scripts/coverage-summary.js
npm start
```

La API escucha en http://localhost:3000. PORT y DB_PATH son configurables. Las pruebas usan SQLite en memoria; los datos locales existentes se conservan. El proyecto original permanece intacto.

## Endpoints

| Método | Ruta | Función |
|---|---|---|
| POST | /api/users | Crear usuario |
| GET | /api/users | Listar usuarios |
| GET | /api/users/:id | Consultar usuario |
| PUT | /api/users/:id | Reemplazar nombre y correo |
| DELETE | /api/users/:id | Eliminar usuario |
| GET | /api/health | Estado SQLite, mensaje y commit |

POST y PUT reciben `{"name":"Damian Mata","email":"damian@example.com"}`. POST devuelve 201; consultas y cambios 200; entradas inválidas o correos duplicados 400; usuario inexistente 404; fallo de health 503. Respuestas: `{statusCode,data}`. No hay rutas adicionales de tareas, proyectos, versión, estadísticas, respaldo o reset. Health incorpora commit y mensaje para la demostración del despliegue.

## Docker

```powershell
docker build -t backend-api-integrador:local .
docker compose up --build -d
curl.exe http://localhost/api/health
```

El contenedor ejecuta Node como usuario sin privilegios. SQLite se almacena en /app/storage/data.db en un volumen. WAL y busyTimeout permiten el acceso durante las actualizaciones. No modificar las tablas de forma incompatible mientras se solapan las versiones.

## CI/CD

`.github/workflows/main.yml`: push o pull_request a main → test (npm ci, Jest con umbral global 70%, resumen y artefacto de cobertura, simulaciones de despliegue). Solo push a main → build-and-push (Docker login PAT, Buildx, latest y SHA) → deploy-ec2 (SSH, candidata sana, cambio Nginx en puerto 80, verificación del commit y retirada de la anterior).

Crear repositorio GitHub con este contenido en su raíz y rama main. Docker Hub usa repositorio backend-api. GitHub Secrets: DOCKERHUB_USERNAME y DOCKERHUB_TOKEN. Environment production: EC2_HOST, EC2_USERNAME (también acepta EC2_USER), EC2_SSH_KEY y EC2_KNOWN_HOSTS. Validar la huella del host por un canal confiable antes de registrar known_hosts. No escribir datos sensibles reales en código público.

Crear EC2 Ubuntu x86_64. Permitir HTTP 80 y SSH 22 limitado a orígenes autorizados. Ejecutar scripts/setup-ec2.sh, reconectar y comprobar Docker. El runner necesita acceso SSH a la instancia. Los contenedores API no exponen puertos públicos: Nginx publica 80. La primera instalación requiere arranque inicial; la continuidad de posteriores actualizaciones debe medirse en EC2.

## Demostración

Cambiar message de /api/health en index.js, ejecutar las pruebas, hacer commit/push a main y mostrar los tres jobs, los tags latest/SHA y el commit devuelto por health. Definir API_BASE_URL solo en la terminal y ejecutar `node scripts/check-continuity.js` durante el despliegue para registrar respuestas en report/continuity.json. `bash scripts/test-deploy.sh` comprueba cuatro escenarios simulados; no sustituye la medición real en EC2.

## Reporte y evidencia

Reporte_integrador.pdf incluye portada UTEQ, IDGS15, Damian Anwar Mata Nevarez, matrícula 2023371173 y docente EMMANUEL MARTINEZ HERNANDEZ. Incluye introducción, diagramas, cobertura, conclusiones y fuentes. No contiene fotos del pizarrón. report/validation.md registra los resultados actuales de Jest; docs/CUMPLIMIENTO.md indica lo verificado y pendiente. La publicación en GitHub/Docker Hub y el despliegue EC2 siguen pendientes.

## Fuentes

- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- https://docs.docker.com/build/building/multi-stage/
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-security-group.html
