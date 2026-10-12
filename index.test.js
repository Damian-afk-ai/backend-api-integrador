process.env.DB_PATH = ':memory:';
process.env.PORT = '0';
const request = require('supertest');
const db = require('./database');
const { app, startServers } = require('./index');
const sample = { name: 'Damian Mata', email: 'damian@example.com' };
const create = (data = sample) => request(app).post('/api/users').send(data);
beforeEach(async () => { await db.ready; await new Promise((resolve, reject) => db.run('DELETE FROM users', err => err ? reject(err) : resolve())); });
afterEach(() => jest.restoreAllMocks());
afterAll(done => { db.close(done); });
test('API expone exactamente las seis combinaciones solicitadas', () => {
    const routes = app._router.stack.filter(layer => layer.route).flatMap(layer => Object.keys(layer.route.methods).map(method => `${method.toUpperCase()} ${layer.route.path}`));
    expect(routes.sort()).toEqual(['POST /api/users', 'GET /api/users', 'GET /api/users/:id', 'PUT /api/users/:id', 'DELETE /api/users/:id', 'GET /api/health'].sort());
});
test('POST crea y persiste usuario', async () => {
    const res = await create(); expect(res.status).toBe(201);
    expect((await request(app).get(`/api/users/${res.body.data.id}`)).body.data).toMatchObject(sample);
});
test('GET lista usuarios', async () => {
    await create(); const res = await request(app).get('/api/users');
    expect(res.status).toBe(200); expect(res.body.data).toEqual([expect.objectContaining(sample)]);
});
test('GET por id obtiene usuario', async () => {
    const user = await create(); expect((await request(app).get(`/api/users/${user.body.data.id}`)).status).toBe(200);
});
test('PUT reemplaza y persiste usuario', async () => {
    const user = await create(); const url = `/api/users/${user.body.data.id}`;
    expect((await request(app).put(url).send({ name: 'Damian Anwar', email: 'otro@example.com' })).status).toBe(200);
    expect((await request(app).get(url)).body.data.email).toBe('otro@example.com');
});
test('DELETE elimina usuario', async () => {
    const user = await create(); const url = `/api/users/${user.body.data.id}`;
    expect((await request(app).delete(url)).status).toBe(200);
    expect((await request(app).get(url)).status).toBe(404);
});
test('GET health comprueba SQLite e identifica el commit', async () => {
    process.env.COMMIT_SHA = 'a'.repeat(40);
    try { expect((await request(app).get('/api/health')).body.data).toMatchObject({ healthy: true, commit: 'a'.repeat(40) }); }
    finally { delete process.env.COMMIT_SHA; }
    expect((await request(app).get('/api/health')).body.data.commit).toBe('local');
});
test.each(['get', 'put', 'delete'])('%s usuario inexistente devuelve 404', async method => {
    const call = request(app)[method]('/api/users/99999'); expect((await (method === 'put' ? call.send(sample) : call)).status).toBe(404);
});
test.each(['abc', '0', '-1', '9007199254740992'])('id %s invalido devuelve 400', async id => {
    expect((await request(app).get(`/api/users/${id}`)).status).toBe(400);
});
test.each([{ name: 'A', email: 'bad' }, { name: 'Damian' }, { ...sample, extra: true }])('rechaza entrada invalida %j', async body => {
    expect((await create(body)).status).toBe(400);
});
test('email duplicado rechazado al crear y actualizar', async () => {
    await create(); expect((await create()).status).toBe(400);
    const other = await create({ name: 'Otro usuario', email: 'otro@example.com' });
    expect((await request(app).put(`/api/users/${other.body.data.id}`).send(sample)).status).toBe(400);
});
test('errores de JSON y limites del cuerpo', async () => {
    expect((await request(app).post('/api/users').set('Content-Type', 'application/json').send('{')).status).toBe(400);
    expect((await create({ ...sample, name: 'x'.repeat(110000) })).status).toBe(413);
});
test.each(['/users', '/api/tasks', '/api/projects', '/api/version', '/api/stats'])('ruta adicional %s no existe', async route => {
    expect((await request(app).get(route)).status).toBe(404);
});
test.each(['/api/backup', '/api/database/reset'])('operacion adicional %s no existe', async route => {
    expect((await request(app).post(route)).status).toBe(404);
});
test('error de consulta devuelve 500 sin detalles internos', async () => {
    jest.spyOn(db, 'all').mockImplementationOnce((sql, args, callback) => { callback(new Error('internal detail')); });
    const res = await request(app).get('/api/users'); expect(res.status).toBe(500); expect(res.body.data).toBe('Error interno');
});
test('health devuelve 503 cuando falla SQLite', async () => {
    jest.spyOn(db, 'get').mockImplementationOnce((sql, callback) => { callback(new Error('unavailable')); });
    const res = await request(app).get('/api/health'); expect(res.status).toBe(503); expect(res.body.data.healthy).toBe(false);
});
test('inicio y cierre HTTP', async () => {
    const { httpServer } = startServers();
    await new Promise(resolve => httpServer.listening ? resolve() : httpServer.once('listening', resolve));
    await new Promise(resolve => httpServer.close(resolve));
});
