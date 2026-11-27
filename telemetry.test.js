process.env.DB_PATH = ':memory:';
process.env.ADMIN_USER = 'operador';
process.env.ADMIN_PASSWORD = 'solo-para-pruebas';

const http = require('node:http');
const { once } = require('node:events');
const request = require('supertest');
const db = require('./database');
const { app } = require('./index');

afterAll(done => { db.close(done); });

test.each([
    ['POST /api/login', ['SQLite DELETE', 'SQLite INSERT']],
    ['GET /api/health', []]
])('envía las tres señales OTLP para %s', async (operation, spans) => {
    const received = new Map();
    let delivered;
    const delivery = new Promise(resolve => { delivered = resolve; });
    const collector = http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        received.set(req.url, { data: JSON.parse(body), auth: req.headers.authorization });
        res.writeHead(200).end('{}');
        if (received.size === 3) delivered();
    });
    collector.listen(0, '127.0.0.1');
    await once(collector, 'listening');
    process.env.OTLP_ENDPOINT = 'http://127.0.0.1:' + collector.address().port + '/api/demo';
    process.env.OTLP_AUTH = 'Basic test';
    let timeout;
    try {
        await request(app).get('/internal/health').expect(200);
        expect(received.size).toBe(0);
        if (operation === 'GET /api/health') {
            await request(app).get('/api/health').expect('Cache-Control', 'no-store').expect(200);
        } else await request(app).post('/api/login').send({
            username: process.env.ADMIN_USER,
            password: process.env.ADMIN_PASSWORD
        }).expect(200);
        await Promise.race([delivery, new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Faltan señales OTLP')), 3000);
        })]);
        const logs = received.get('/api/demo/v1/logs');
        const traces = received.get('/api/demo/v1/traces').data;
        const metrics = received.get('/api/demo/v1/metrics').data;
        const [log] = logs.data.resourceLogs[0].scopeLogs[0].logRecords;
        const [root, ...children] = traces.resourceSpans[0].scopeSpans[0].spans;
        expect(logs.auth).toBe('Basic test');
        expect(log.traceId).toBe(root.traceId);
        expect(root.name).toBe(operation);
        expect(children.map(span => span.name)).toEqual(spans);
        expect(children.every(span => span.parentSpanId === root.spanId)).toBe(true);
        expect(metrics.resourceMetrics[0].scopeMetrics[0].metrics.map(metric => metric.name))
            .toEqual(['http.server.requests', 'http.server.request.duration']);
        expect(JSON.stringify([...received.values()])).not.toContain(process.env.ADMIN_PASSWORD);
    } finally {
        clearTimeout(timeout);
        delete process.env.OTLP_ENDPOINT;
        delete process.env.OTLP_AUTH;
        await new Promise(resolve => collector.close(resolve));
    }
});
