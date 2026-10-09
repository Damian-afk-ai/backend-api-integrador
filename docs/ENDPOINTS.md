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

