const express = require('express');
const path = require('node:path');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const db = require('./database');
const { validateUser, validateProduct } = require('./schemas');
const telemetry = require('./telemetry');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const respond = (res, statusCode, data) => res.status(statusCode).json({ statusCode, data });
const query = (method, sql, args = []) => new Promise((resolve, reject) => {
    const finish = telemetry.databaseSpan(sql.split(' ', 1)[0]);
    db[method](sql, args, function (err, rows) {
        finish(err);
        err ? reject(err) : resolve(method === 'run' ? this : rows);
    });
});
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.use((req, res, next) => req.path.startsWith('/api/') ? telemetry.middleware(req, res, next) : next());
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => db.ready.then(() => next(), next));
app.use(express.static(path.join(__dirname, 'public')));
const digest = value => createHash('sha256').update(value).digest();
const sessionLifetime = 8 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api' };
const sessionHash = req => {
    const token = req.headers.cookie?.match(/(?:^|;\s*)parcial_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    return token ? digest(token).toString('hex') : '';
};
const requireSession = wrap(async (req, res, next) => {
    const token = sessionHash(req);
    const session = token && await query('get', 'SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?', [token, Date.now()]);
    if (!session) return respond(res, 401, 'Inicia sesión para continuar');
    next();
});
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.get('Sec-Fetch-Site') === 'cross-site' && !['GET', 'HEAD'].includes(req.method)) {
        return respond(res, 403, 'Origen no permitido');
    }
    next();
});
app.post('/api/login', wrap(async (req, res) => {
    const { username, password } = req.body || {};
    const configuredUser = process.env.ADMIN_USER;
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (!configuredUser || !configuredPassword) return respond(res, 503, 'Configura el acceso de administración');
    if (typeof username !== 'string' || typeof password !== 'string' ||
        !timingSafeEqual(digest(password), digest(configuredPassword)) || username !== configuredUser) {
        return respond(res, 401, 'Usuario o contraseña incorrectos');
    }
    const token = randomBytes(32).toString('hex');
    await query('run', 'DELETE FROM sessions WHERE expires_at <= ? OR token_hash = ?', [Date.now(), sessionHash(req)]);
    await query('run', 'INSERT INTO sessions VALUES (?, ?)', [digest(token).toString('hex'), Date.now() + sessionLifetime]);
    res.cookie('parcial_session', token, { ...cookieOptions, maxAge: sessionLifetime });
    respond(res, 200, { username });
}));
app.get('/api/session', requireSession, (req, res) => respond(res, 200, { username: process.env.ADMIN_USER }));
app.post('/api/logout', wrap(async (req, res) => {
    await query('run', 'DELETE FROM sessions WHERE token_hash = ?', [sessionHash(req)]);
    res.clearCookie('parcial_session', cookieOptions);
    respond(res, 200, 'Sesión cerrada');
}));
app.use(['/api/users', '/api/products'], requireSession);
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
const productColumns = 'id, name, price_cents AS priceCents, stock';
app.get('/api/products', wrap(async (req, res) => {
    respond(res, 200, await query('all', `SELECT ${productColumns} FROM products ORDER BY id`));
}));
app.get('/api/products/:id', wrap(async (req, res) => {
    const product = await query('get', `SELECT ${productColumns} FROM products WHERE id = ?`, [req.params.id]);
    respond(res, product ? 200 : 404, product || 'Producto no encontrado');
}));
app.post('/api/products', validateProduct, wrap(async (req, res) => {
    const { name, priceCents, stock } = req.body;
    const result = await query('run', 'INSERT INTO products (name, price_cents, stock) VALUES (?, ?, ?)', [name.trim(), priceCents, stock]);
    respond(res, 201, { id: result.lastID, name: name.trim(), priceCents, stock });
}));
app.put('/api/products/:id', validateProduct, wrap(async (req, res) => {
    const { name, priceCents, stock } = req.body;
    const id = Number(req.params.id);
    const result = await query('run', 'UPDATE products SET name = ?, price_cents = ?, stock = ? WHERE id = ?', [name.trim(), priceCents, stock, id]);
    respond(res, result.changes ? 200 : 404, result.changes ? { id, name: name.trim(), priceCents, stock } : 'Producto no encontrado');
}));
app.delete('/api/products/:id', wrap(async (req, res) => {
    const result = await query('run', 'DELETE FROM products WHERE id = ?', [req.params.id]);
    respond(res, result.changes ? 200 : 404, result.changes ? 'Producto eliminado correctamente' : 'Producto no encontrado');
}));
app.get('/api/health', (req, res) => db.get('SELECT 1 AS ok', (err) => respond(res, err ? 503 : 200, {
    service: 'backend-api-integrador 2', healthy: !err,
    commit: process.env.COMMIT_SHA || 'local', message: 'Prueba 4 realizada por Damian'
})));
app.use((req, res) => respond(res, 404, 'Ruta no encontrada'));
app.use((err, req, res, next) => {
    if (String(err.message).includes('UNIQUE constraint failed')) return respond(res, 400, 'El email ya esta registrado');
    if (err.status === 400) return respond(res, 400, 'JSON invalido');
    if (err.status === 413) return respond(res, 413, 'Cuerpo demasiado grande');
    res.locals.exceptionType = err.name;
    return respond(res, 500, 'Error interno');
});
function startServers() {
    const httpServer = app.listen(PORT, process.env.HOST, () => console.log(`Servidor API escuchando en el puerto ${PORT}`));
    return { httpServer };
}
if (require.main === module) startServers();
module.exports = { app, startServers };

