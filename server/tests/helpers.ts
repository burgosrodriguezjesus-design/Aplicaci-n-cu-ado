import request from 'supertest';
import { get, openDb, run } from '../db/db.js';
import { createApp } from '../app.js';
import { setNow } from '../lib/clock.js';
import { resetLimits } from '../routes/auth.js';

/** Crea una pastelería con un agente que guarda su cookie de acceso. */
export async function newBakery(app: ReturnType<typeof createApp>, opts: { name?: string; demo?: boolean } = {}) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/create').send({ business_name: opts.name ?? 'Dulce Test', name: 'Dueña', demo: !!opts.demo });
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  return agent;
}

/**
 * Base de datos nueva en memoria + app + agente con su pastelería.
 * Las consultas directas de las pruebas (all/get) ven los datos de esa pastelería.
 */
export async function freshApp(opts: { demo?: boolean; now?: string } = {}) {
  setNow(opts.now ? new Date(opts.now) : new Date('2026-10-07T08:00:00Z'));
  // Postgres real en memoria (PGlite): cada prueba empieza con una base de datos limpia.
  await openDb({ url: null, dataDir: 'memory' });
  resetLimits();
  const app = createApp();
  const admin = await newBakery(app, { demo: opts.demo });
  const t = await get<{ schema: string }>('SELECT schema FROM public.tenants ORDER BY id DESC LIMIT 1');
  await run(`SET search_path TO "${t!.schema}"`);
  return { app, admin };
}
