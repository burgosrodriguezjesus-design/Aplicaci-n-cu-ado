// Punto de entrada en Vercel: la API como una sola función. La web la sirve el CDN.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.js';

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // La ruta de Vercel envía /api/<resto> como ?__p=<resto>; se reconstruye la URL original.
  const url = new URL(req.url ?? '/', 'http://localhost');
  const p = url.searchParams.get('__p');
  if (p !== null) {
    url.searchParams.delete('__p');
    req.url = `/api/${p}${url.search}`;
  }
  return app(req as any, res as any);
}
