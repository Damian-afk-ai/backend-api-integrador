const { GITHUB_SHA, GITHUB_REF_NAME, GITHUB_ACTOR, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_EVENT_NAME,
    OPENOBSERVE_ENDPOINT, OPENOBSERVE_AUTH, EVENT_NAME, EVENT_RESULT } = process.env;

async function main() {
    if (!OPENOBSERVE_ENDPOINT || !OPENOBSERVE_AUTH) {
        if (GITHUB_EVENT_NAME === 'pull_request') {
            console.log('OpenObserve requiere secretos del repositorio para registrar esta ejecución.');
            return;
        }
        throw new Error('Configura OPENOBSERVE_ENDPOINT y OPENOBSERVE_AUTH en GitHub');
    }
    const endpoint = new URL(OPENOBSERVE_ENDPOINT);
    if (endpoint.protocol !== 'https:') throw new Error('OpenObserve del pipeline debe usar HTTPS');
    const response = await fetch(endpoint.href.replace(/\/$/, '') + '/inventario_cicd/_json', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: OPENOBSERVE_AUTH },
        body: JSON.stringify([{
            _timestamp: Date.now() * 1000, evento: EVENT_NAME, resultado: EVENT_RESULT,
            commit: GITHUB_SHA, rama: GITHUB_REF_NAME, actor: GITHUB_ACTOR,
            ejecucion: GITHUB_RUN_ID, intento: GITHUB_RUN_ATTEMPT
        }]),
        signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('La ingestión devolvió HTTP ' + response.status);
    const result = await response.json();
    if (!result.status?.some(stream => stream.successful > 0) || result.status.some(stream => stream.failed > 0)) {
        throw new Error('OpenObserve no confirmó la ingestión del evento');
    }
    console.log('OpenObserve recibió el evento', EVENT_NAME, EVENT_RESULT);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
