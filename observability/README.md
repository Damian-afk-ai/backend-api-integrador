# OpenObserve para el Parcial 2

En OpenObserve, copia la URL HTTPS de ingesta OTLP (termina en `/api/organización`) y el encabezado completo `Authorization` que indica **Data sources**. Usa un token de ingesta de la organización.

| Destino | Variables |
| --- | --- |
| Secretos del repositorio GitHub | `OPENOBSERVE_ENDPOINT`, `OPENOBSERVE_AUTH` |
| Archivo privado `~/backend-api-deploy/application.env` de EC2 | `OTLP_ENDPOINT`, `OTLP_AUTH`, `ADMIN_USER`, `ADMIN_PASSWORD` |

El recolector se configura en EC2 con `docker compose --env-file ~/backend-api-deploy/application.env -f observability/compose.yml up -d`. Usa el mismo destino que la aplicación y no publica un puerto propio.

GitHub registra pruebas aprobadas y fallidas en `inventario_cicd`. El despliegue depende del resultado de las pruebas y de la entrega del informe. Solo un push a `main` puede publicar y conectarse por SSH. Si se completa el despliegue, se registra el evento correspondiente.

La API envía logs al stream `inventario_http`, trazas con spans de SQLite, un contador de peticiones y un histograma de latencia. La ruta de salud de Docker se excluye. Los atributos incluyen método, ruta de Express y código HTTP. Los logs no incluyen cuerpos de peticiones, credenciales ni parámetros de consulta.

En OpenObserve, crea un tablero con el stream `inventario_cicd`, la latencia y el volumen por ruta, la proporción de respuestas HTTP con error y las métricas de CPU, memoria y tráfico del host. Crea una alerta sobre `evento = 'pruebas' AND resultado = 'failure'` y define un destino existente. La temperatura requiere un sensor válido en EC2. La lectura `-273.1 °C` que muestra el sistema en esta instancia no es utilizable como medición.
