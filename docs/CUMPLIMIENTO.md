# Cumplimiento

| Requisito | Estado |
|---|---|
| 6 endpoints | Cinco operaciones de usuarios y GET /api/health; inventario comprobado por Jest |
| Cobertura mínima 70% | Umbral obligatorio en las cuatro métricas; resultados actuales en report/validation.md |
| Docker | Dockerfile, dockerignore y compose incluidos; verificación de esta versión en report/docker-validation.json |
| CI push/PR main | Workflow test → build-and-push → deploy-ec2 preparado; pendiente ejecución externa |
| Docker Hub latest/SHA y PAT | Configuración preparada; pendiente publicar con Secrets |
| EC2 Ubuntu, SSH 22 y HTTP 80 | Guía y scripts preparados; pendiente instancia y despliegue real |
| Reporte PDF | Portada UTEQ completada; sin fotos del pizarrón; resultados locales y fuentes |
| Repositorio y URL pública | Pendientes de recursos externos del propietario |

La API se ajustó a seis endpoints según la aclaración del alumno. Las tablas y archivos de datos existentes se conservan. Health incluye el commit para verificar el despliegue sin exponer otra ruta. Las cuatro simulaciones del script comprueban actualización sana y rollback ante errores, sin acreditar Docker/EC2 reales.
