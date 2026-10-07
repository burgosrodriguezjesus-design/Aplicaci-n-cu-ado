// Servidor propio (ordenador de la tienda, VPS, Docker…).
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/db.js';
import { createApp } from './app.js';
import { loadSettings } from './services/settings.js';
import { runDaily } from './services/daily.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// En producción el servidor compilado está en dist/ y la web en dist/web.
const webDir = process.env.WEB_DIR || path.join(here, 'web');

await openDb();
const app = createApp({ webDir });

async function daily() {
  try {
    await loadSettings();
    await runDaily();
  } catch (e) {
    console.error('Error en las tareas automáticas', e);
  }
}
if (process.env.AUTO_BACKUPS !== '0') {
  await daily();
  setInterval(daily, 60 * 60 * 1000).unref();
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`\n🧁 Aplicación de gestión de pastelería en marcha`);
  console.log(`   Base de datos: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'local (carpeta data/pglite)'}`);
  console.log(`   En este ordenador:  http://localhost:${port}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`   Desde el móvil (misma wifi): http://${a.address}:${port}`);
    }
  }
  console.log('');
});
