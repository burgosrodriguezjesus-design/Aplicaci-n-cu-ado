import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { errorHandler, h, loadUser, requireAuth } from './http.js';
import { ensureDb } from './db/db.js';
import { runDailyAll } from './services/daily.js';
import { authRouter } from './routes/auth.js';
import { coreRouter } from './routes/core.js';
import { ordersRouter } from './routes/orders.js';
import { businessRouter } from './routes/business.js';

export function createApp(opts: { webDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY ?? (process.env.VERCEL ? true : 'loopback, linklocal, uniquelocal'));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // Tarea diaria (cron de Vercel). Protegida con CRON_SECRET.
  app.get(
    '/api/cron/daily',
    h(async (req, res) => {
      const secret = process.env.CRON_SECRET;
      if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        res.status(401).json({ error: 'No autorizado' });
        return;
      }
      await ensureDb();
      return runDailyAll();
    }),
  );

  app.use('/api', cookieParser(), express.json({ limit: '2mb' }), loadUser);
  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth, coreRouter, ordersRouter, businessRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'No encontrado' });
  });

  // Aplicación web compilada (servidor propio; en Vercel la sirve su CDN).
  const webDir = opts.webDir;
  if (webDir && fs.existsSync(path.join(webDir, 'index.html'))) {
    app.use(
      express.static(webDir, {
        index: false,
        setHeaders(res, file) {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
