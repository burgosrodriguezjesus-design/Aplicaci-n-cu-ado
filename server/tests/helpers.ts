import request from 'supertest';
import { openDb } from '../db/db.js';
import { createApp } from '../app.js';
import { setNow } from '../lib/clock.js';

/** Base de datos nueva en un fichero temporal + app + agente con sesión de administrador. */
export async function freshApp(opts: { demo?: boolean; now?: string } = {}) {
  setNow(opts.now ? new Date(opts.now) : new Date('2026-10-07T08:00:00Z'));
  // Postgres real en memoria (PGlite): cada prueba empieza con una base de datos limpia.
  await openDb({ url: null, dataDir: 'memory' });
  const app = createApp();
  const admin = request.agent(app);
  const r = await admin
    .post('/api/auth/setup')
    .send({ business_name: 'Dulce Test', name: 'Dueña', username: 'admin', password: 'secreto1', demo: !!opts.demo });
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  return { app, admin };
}

export async function employee(app: ReturnType<typeof createApp>, admin: request.Agent) {
  await admin.post('/api/users').send({ name: 'Pepe', username: 'pepe', password: 'empleado1', role: 'employee' }).expect(200);
  const emp = request.agent(app);
  await emp.post('/api/auth/login').send({ username: 'pepe', password: 'empleado1' }).expect(200);
  return emp;
}
