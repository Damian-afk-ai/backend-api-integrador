process.env.DB_PATH = ':memory:';
process.env.PORT = '0';
const request = require('supertest');
process.env.ADMIN_USER = 'operador';
process.env.ADMIN_PASSWORD = 'clave-local-de-pruebas';
const db = require('./database');
const { app, startServers } = require('./index');
const sample = { name: 'Damian Mata', email: 'damian@example.com' };
const credentials = { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD };
let client;
const create = (data = sample) => client.post('/api/users').send(data);
beforeEach(async () => {
    await db.ready;
    await new Promise((resolve, reject) => db.exec('DELETE FROM users; DELETE FROM products; DELETE FROM sessions;', err => err ? reject(err) : resolve()));
    client = request.agent(app);
    expect((await client.post('/api/login').send(credentials)).status).toBe(200);
});
afterEach(() => jest.restoreAllMocks());
afterAll(done => { db.close(done); });
test('API conserva las rutas de usuarios y salud del integrador', () => {
    const routes = app._router.stack.filter(layer => layer.route).flatMap(layer => Object.keys(layer.route.methods).map(method => `${method.toUpperCase()} ${layer.route.path}`));
    expect(routes).toEqual(expect.arrayContaining(['POST /api/users', 'GET /api/users', 'GET /api/users/:id', 'PUT /api/users/:id', 'DELETE /api/users/:id', 'GET /api/health']));
});
test('protege ambos CRUD y revoca la sesión al salir', async () => {
    const guest = request(app);
    expect((await guest.get('/api/users')).status).toBe(401);
    expect((await guest.get('/api/products')).status).toBe(401);
    expect((await guest.post('/api/login').send({ ...credentials, password: 'incorrecta' })).status).toBe(401);
    const login = await client.post('/api/login').send(credentials);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await client.get('/api/session')).body.data).toEqual({ username: credentials.username });
    expect((await client.post('/api/logout')).status).toBe(200);
    expect((await guest.get('/api/session').set('Cookie', cookie)).status).toBe(401);
});
test('valida y persiste el CRUD de productos', async () => {
    const product = { name: 'Teclado', priceCents: 12999, stock: 4 };
    expect((await client.post('/api/products').send({ ...product, priceCents: 1.5 })).status).toBe(400);
    expect((await client.post('/api/products').send({ ...product, name: '  ' })).status).toBe(400);
    const created = await client.post('/api/products').send(product);
    expect(created.status).toBe(201);
    const { id } = created.body.data;
    const url = '/api/products/' + id;
    expect((await client.get('/api/products')).body.data).toEqual([{ id, ...product }]);
    expect((await client.get(url)).body.data).toEqual({ id, ...product });
    expect((await client.put(url).send({ ...product, stock: 0 })).body.data.stock).toBe(0);
    expect((await client.delete(url)).status).toBe(200);
    expect((await client.get(url)).status).toBe(404);
    expect((await client.put(url).send(product)).status).toBe(404);
    expect((await client.delete(url)).status).toBe(404);
});
test('POST crea y persiste usuario', async () => {
    const res = await create(); expect(res.status).toBe(201);
    expect((await client.get(`/api/users/${res.body.data.id}`)).body.data).toMatchObject(sample);
});
test('GET lista usuarios', async () => {
    await create(); const res = await client.get('/api/users');
    expect(res.status).toBe(200); expect(res.body.data).toEqual([expect.objectContaining(sample)]);
});
test('GET por id obtiene usuario', async () => {
    const user = await create(); expect((await client.get(`/api/users/${user.body.data.id}`)).status).toBe(200);
});
test('PUT reemplaza y persiste usuario', async () => {
    const user = await create(); const url = `/api/users/${user.body.data.id}`;
    expect((await client.put(url).send({ name: 'Damian Anwar', email: 'otro@example.com' })).status).toBe(200);
    expect((await client.get(url)).body.data.email).toBe('otro@example.com');
});
test('DELETE elimina usuario', async () => {
    const user = await create(); const url = `/api/users/${user.body.data.id}`;
    expect((await client.delete(url)).status).toBe(200);
    expect((await client.get(url)).status).toBe(404);
});
test('GET health comprueba SQLite e identifica el commit', async () => {
    process.env.COMMIT_SHA = 'a'.repeat(40);
    try { expect((await request(app).get('/api/health')).body.data).toMatchObject({ healthy: true, commit: 'a'.repeat(40) }); }
    finally { delete process.env.COMMIT_SHA; }
    expect((await request(app).get('/api/health')).body.data.commit).toBe('local');
});
test.each(['get', 'put', 'delete'])('%s usuario inexistente devuelve 404', async method => {
    const call = client[method]('/api/users/99999'); expect((await (method === 'put' ? call.send(sample) : call)).status).toBe(404);
});
test.each(['abc', '0', '-1', '9007199254740992'])('id %s invalido devuelve 400', async id => {
    expect((await client.get(`/api/users/${id}`)).status).toBe(400);
});
test.each([{ name: 'A', email: 'bad' }, { name: 'Damian' }, { ...sample, extra: true }])('rechaza entrada invalida %j', async body => {
    expect((await create(body)).status).toBe(400);
});
test('email duplicado rechazado al crear y actualizar', async () => {
    await create(); expect((await create()).status).toBe(400);
    const other = await create({ name: 'Otro usuario', email: 'otro@example.com' });
    expect((await client.put(`/api/users/${other.body.data.id}`).send(sample)).status).toBe(400);
});
test('errores de JSON y limites del cuerpo', async () => {
    expect((await client.post('/api/users').set('Content-Type', 'application/json').send('{')).status).toBe(400);
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
    const res = await client.get('/api/users'); expect(res.status).toBe(500); expect(res.body.data).toBe('Error interno');
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
