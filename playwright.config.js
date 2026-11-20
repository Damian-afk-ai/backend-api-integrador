const { defineConfig } = require('playwright/test');

const port = process.env.PLAYWRIGHT_PORT || '4173';
const baseURL = 'http://127.0.0.1:' + port;
module.exports = defineConfig({
    testDir: './tests',
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'node index.js',
        url: baseURL + '/api/health',
        env: {
            PORT: port, HOST: '127.0.0.1', DB_PATH: ':memory:', NODE_ENV: 'test',
            ADMIN_USER: 'operador', ADMIN_PASSWORD: 'clave-local-de-pruebas'
        },
        reuseExistingServer: false
    }
});
