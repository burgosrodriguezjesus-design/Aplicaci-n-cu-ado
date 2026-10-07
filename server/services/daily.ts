// Tareas diarias: automatizaciones, limpieza de fotos sin usar y copia de seguridad.
// En Vercel las lanza el cron diario; en un servidor propio, un temporizador.
import { run } from '../db/db.js';
import { now } from '../lib/clock.js';
import { runAutomations } from './orders.js';
import { dailyBackup } from './backup.js';

export async function runDaily() {
  const moved = await runAutomations();
  // Fotos subidas que no se llegaron a usar (formularios abandonados).
  const cutoff = new Date(now().getTime() - 86400000).toISOString();
  const cleaned = await run(
    `DELETE FROM images WHERE created_at < ?
       AND id NOT IN (SELECT image_id FROM order_images)
       AND id NOT IN (SELECT photo_id FROM recipes WHERE photo_id IS NOT NULL)
       AND id NOT IN (SELECT photo_id FROM products WHERE photo_id IS NOT NULL)`,
    [cutoff],
  );
  await dailyBackup();
  return { moved_to_production: moved, images_cleaned: cleaned.changes };
}
