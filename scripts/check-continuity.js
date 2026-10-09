// Run during a deployment. API_BASE_URL stays in the environment, outside public files.
const fs = require('fs');
const { performance } = require('perf_hooks');
const base = process.env.API_BASE_URL;
if (!base) throw new Error('Define API_BASE_URL in your environment');
const seconds = Number(process.env.MONITOR_SECONDS || 120);
if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) throw new Error('MONITOR_SECONDS must be between 1 and 3600');
(async () => {
 const end = performance.now() + seconds * 1000;
 const records = [];
 while (performance.now() < end) {
  const start = performance.now();
  let status = 0, healthy = false;
  try {
   const response = await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(3000) });
   status = response.status;
   healthy = response.ok && (await response.json()).data.healthy === true;
  } catch { /* Record network failures without exposing the host. */ }
  records.push({ time: new Date().toISOString(), status, healthy, milliseconds: Math.round(performance.now() - start) });
  await new Promise(resolve => setTimeout(resolve, 250));
 }
 const failed = records.filter(row => !row.healthy).length;
 fs.mkdirSync('report', { recursive: true });
 fs.writeFileSync('report/continuity.json', JSON.stringify({ samples: records.length, failed, records }, null, 2));
 console.log(`${records.length} solicitudes; ${failed} fallas. Evidencia: report/continuity.json`);
 process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
