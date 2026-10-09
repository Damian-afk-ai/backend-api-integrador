const express = require('express');
const cors = require('cors');
const db = require('./database');
const { validateUser } = require('./schemas');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const respond = (res, statusCode, data) => res.status(statusCode).json({ statusCode, data });
const query = (method, sql, args = []) => new Promise((resolve, reject) => {
    db[method](sql, args, function (err, rows) { err ? reject(err) : resolve(method === 'run' ? this : rows); });
});
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => db.ready.then(() => next(), next));
app.param('id', (req, res, next, id) => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? next() : respond(res, 400, 'ID invalido'));
app.post('/api/users', validateUser, wrap(async (req, res) => {
    const { name, email } = req.body;
    const result = await query('run', 'INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
    respond(res, 201, { id: result.lastID, name, email });
}));
app.get('/api/users', wrap(async (req, res) => respond(res, 200, await query('all', 'SELECT * FROM users ORDER BY id'))));
app.get('/api/users/:id', wrap(async (req, res) => {
    const row = await query('get', 'SELECT * FROM users WHERE id = ?', [req.params.id]);
    respond(res, row ? 200 : 404, row || 'Usuario no encontrado');
}));
app.put('/api/users/:id', validateUser, wrap(async (req, res) => {
    const { name, email } = req.body;
    const result = await query('run', 'UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, req.params.id]);
    respond(res, result.changes ? 200 : 404, result.changes ? { id: Number(req.params.id), name, email } : 'Usuario no encontrado');
}));
app.delete('/api/users/:id', wrap(async (req, res) => {
    const result = await query('run', 'DELETE FROM users WHERE id = ?', [req.params.id]);
    respond(res, result.changes ? 200 : 404, result.changes ? 'Usuario eliminado correctamente' : 'Usuario no encontrado');
}));
app.get('/api/health', (req, res) => db.get('SELECT 1 AS ok', (err) => respond(res, err ? 503 : 200, {
    service: 'backend-api-integrador', healthy: !err,
    commit: process.env.COMMIT_SHA || 'local', message: 'Proyecto integrador CI/CD'
})));
app.use((req, res) => respond(res, 404, 'Ruta no encontrada'));
app.use((err, req, res, next) => {
    if (String(err.message).includes('UNIQUE constraint failed')) return respond(res, 400, 'El email ya esta registrado');
    if (err.status === 400) return respond(res, 400, 'JSON invalido');
    if (err.status === 413) return respond(res, 413, 'Cuerpo demasiado grande');
    return respond(res, 500, 'Error interno');
});
function startServers() {
    const httpServer = app.listen(PORT, () => console.log(`Servidor API escuchando en el puerto ${PORT}`));
    return { httpServer };
}
if (require.main === module) startServers();
module.exports = { app, startServers };
