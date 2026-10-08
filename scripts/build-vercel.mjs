// Compila para Vercel con la Build Output API:
//   .vercel/output/static        → la web (CDN)
//   .vercel/output/functions/api → la API (una función Node.js en París)
//   .vercel/output/config.json   → rutas y tarea diaria (cron)
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const out = '.vercel/output';
fs.rmSync(out, { recursive: true, force: true });

execSync('npx vite build', { stdio: 'inherit' });
fs.mkdirSync(out, { recursive: true });
fs.cpSync('dist/web', `${out}/static`, { recursive: true });

const fn = `${out}/functions/api.func`;
fs.mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ['server/vercel.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // PGlite solo se usa en local; en Vercel siempre hay DATABASE_URL.
  external: ['pg-native', '@electric-sql/pglite'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
fs.writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      maxDuration: 300,
      regions: ['cdg1'],
    },
    null,
    2,
  ),
);
fs.writeFileSync(`${fn}/package.json`, JSON.stringify({ type: 'module' }));

fs.writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '^/(sw\\.js|index\\.html)?$', headers: { 'cache-control': 'no-cache' }, continue: true },
        { src: '^/api/(.*)$', dest: '/api?__p=$1' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
      crons: [{ path: '/api/cron/daily', schedule: '0 4 * * *' }],
    },
    null,
    2,
  ),
);
console.log('✓ Salida para Vercel lista en .vercel/output');
