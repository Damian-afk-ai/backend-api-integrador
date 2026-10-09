const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const coverage = JSON.parse(fs.readFileSync(path.join(root, 'coverage/coverage-summary.json'), 'utf8')).total;
const tests = JSON.parse(fs.readFileSync(path.join(root, 'report/test-results.json'), 'utf8'));
const lines = ['## Pruebas y cobertura', '', `${tests.numPassedTests}/${tests.numTotalTests} pruebas aprobadas en ${tests.numTotalTestSuites} suites.`, '', '| Metrica | Cobertura | Minimo |', '|---|---:|---:|'];
for (const key of ['statements', 'branches', 'functions', 'lines']) {
 lines.push(`| ${key} | ${coverage[key].pct}% | 70% |`);
 if (coverage[key].pct < 70) process.exitCode = 1;
}
if (!tests.success) process.exitCode = 1;
const markdown = lines.join('\n') + '\n';
console.log(markdown);
fs.writeFileSync(path.join(root, 'report/validation.md'), markdown);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
