const { AsyncLocalStorage } = require('node:async_hooks');
const { randomBytes } = require('node:crypto');

const context = new AsyncLocalStorage();
const id = bytes => randomBytes(bytes).toString('hex');
const now = () => BigInt(Date.now()) * 1_000_000n;
const attribute = (key, value) => ({
    key, value: typeof value === 'number' ? { intValue: String(value) } : { stringValue: value }
});
const service = { attributes: [attribute('service.name', 'parcial2-inventario')] };
const scope = { name: 'parcial2' };
const signals = {
    logs: ['resourceLogs', 'scopeLogs', 'logRecords'],
    traces: ['resourceSpans', 'scopeSpans', 'spans'],
    metrics: ['resourceMetrics', 'scopeMetrics', 'metrics']
};
let pending = 0;

async function send(signal, records) {
    const endpoint = process.env.OTLP_ENDPOINT;
    const auth = process.env.OTLP_AUTH;
    if (!endpoint || !auth || pending >= 60) return;
    const [resources, scopes, items] = signals[signal];
    pending++;
    try {
        const response = await fetch(endpoint.replace(/\/$/, '') + '/v1/' + signal, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: auth,
                ...(signal === 'logs' && { 'stream-name': 'inventario_http' })
            },
            body: JSON.stringify({ [resources]: [{ resource: service, [scopes]: [{ scope, [items]: records }] }] }),
            signal: AbortSignal.timeout(3500)
        });
        await response.body?.cancel();
        if (!response.ok) console.warn('OpenObserve %s respondió HTTP %s', signal, response.status);
    } catch (error) {
        console.warn('No se pudo enviar %s a OpenObserve (%s)', signal, error.name);
    } finally {
        pending--;
    }
}

function middleware(req, res, next) {
    if (!process.env.OTLP_ENDPOINT || !process.env.OTLP_AUTH) return next();
    const traceId = id(16);
    const spanId = id(8);
    const start = now();
    const started = process.hrtime.bigint();
    const session = { traceId, spanId, spans: [] };
    res.once('finish', () => {
        const elapsed = process.hrtime.bigint() - started;
        const end = start + elapsed;
        const milliseconds = Number(elapsed) / 1e6;
        const endpoint = req.route?.path || 'sin_ruta';
        const attributes = [
            attribute('http.route', endpoint),
            attribute('http.request.method', req.method),
            attribute('http.response.status_code', res.statusCode)
        ];
        const failed = res.statusCode >= 500;
        const status = { code: failed ? 2 : 0 };
        const name = req.method + ' ' + endpoint;
        send('logs', [{
            timeUnixNano: String(end), traceId, spanId,
            severityNumber: failed ? 17 : 9, severityText: failed ? 'ERROR' : 'INFO',
            body: { stringValue: name },
            attributes: [
                ...attributes,
                { key: 'duration_ms', value: { doubleValue: milliseconds } },
                ...(res.locals.exceptionType ? [attribute('exception.type', res.locals.exceptionType)] : [])
            ]
        }]);
        send('traces', [{
            traceId, spanId, name, kind: 2, attributes, status,
            startTimeUnixNano: String(start), endTimeUnixNano: String(end)
        }, ...session.spans]);
        const point = { attributes, startTimeUnixNano: String(start), timeUnixNano: String(end) };
        const bounds = [5, 10, 25, 50, 100, 250, 500, 1000, 2500];
        const bucket = bounds.findIndex(bound => milliseconds <= bound);
        send('metrics', [{
            name: 'http.server.requests', unit: '{request}',
            sum: { aggregationTemporality: 1, isMonotonic: true, dataPoints: [{ ...point, asInt: '1' }] }
        }, {
            name: 'http.server.request.duration', unit: 'ms',
            histogram: { aggregationTemporality: 1, dataPoints: [{
                ...point, count: '1', sum: milliseconds, explicitBounds: bounds,
                bucketCounts: Array.from({ length: bounds.length + 1 }, (_, index) => index === (bucket < 0 ? bounds.length : bucket) ? '1' : '0')
            }] }
        }]);
    });
    context.run(session, next);
}

function databaseSpan(operation) {
    const session = context.getStore();
    if (!session) return () => {};
    const start = now();
    const started = process.hrtime.bigint();
    return error => {
        session.spans.push({
            traceId: session.traceId, parentSpanId: session.spanId, spanId: id(8),
            name: 'SQLite ' + operation, kind: 3,
            attributes: [attribute('db.system.name', 'sqlite'), attribute('db.operation.name', operation)],
            startTimeUnixNano: String(start), endTimeUnixNano: String(start + process.hrtime.bigint() - started),
            status: { code: error ? 2 : 0 }
        });
    };
}

module.exports = { middleware, databaseSpan };
