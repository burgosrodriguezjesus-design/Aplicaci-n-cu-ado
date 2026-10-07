import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, run } from './db/db.js';
import { createApp } from './app.js';
import { runAutomations } from './services/orders.js';
import { scheduleAutoBackups } from './services/backup.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// En producción el servidor compilado está en dist/ y la web en dist/web.
const webDir = process.env.WEB_DIR || path.join(here, 'web');

openDb();
const app = createApp({ webDir });

function housekeeping() {
  try {
    runAutomations();
    // Fotos subidas que no se llegaron a usar (formularios abandonados).
    run(`DELETE FROM images WHERE created_at < datetime('now', '-1 day')
          AND id NOT IN (SELECT image_id FROM order_images)
          AND id NOT IN (SELECT photo_id FROM recipes WHERE photo_id IS NOT NULL)
          AND id NOT IN (SELECT photo_id FROM products WHERE photo_id IS NOT NULL)`);
  } catch (e) {
    console.error('Error en tareas automáticas', e);
  }
}
housekeeping();
setInterval(housekeeping, 10 * 60 * 1000).unref();
if (process.env.AUTO_BACKUPS !== '0') scheduleAutoBackups();

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`\n🧁 Aplicación de gestión de pastelería en marcha`);
  console.log(`   En este ordenador:  http://localhost:${port}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`   Desde el móvil (misma wifi): http://${a.address}:${port}`);
    }
  }
  console.log('');
});
