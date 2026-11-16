// Fail-fast env saat boot (QA-16, QA-29). Logika ada di instrumentation-node.js (hanya runtime Node; core memakai node:crypto).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./instrumentation-node')
}
