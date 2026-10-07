import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { errorHandler, loadUser, requireAuth } from './http.js';
import { authRouter } from './routes/auth.js';
import { coreRouter } from './routes/core.js';
import { ordersRouter } from './routes/orders.js';
import { businessRouter } from './routes/business.js';

export function createApp(opts: { webDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(loadUser);

  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth, coreRouter, ordersRouter, businessRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'No encontrado' });
  });

  // Aplicación web compilada (modo producción).
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
