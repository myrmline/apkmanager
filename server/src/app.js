import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './lib/config.js';
import { errorHandler, notFound } from './lib/http.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import applicationRoutes from './routes/applications.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(morgan('dev'));
  app.use(
    cors({
      origin: (origin, cb) =>
        !origin || config.corsOrigins.includes(origin)
          ? cb(null, true)
          : cb(new Error('Origin not allowed by CORS')),
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/applications', applicationRoutes);

  // Uploads are never served statically — every download goes through an
  // authorisation check in the files router.
  app.use('/api', (_req, _res, next) => next(notFound('No such endpoint.')));
  app.use(errorHandler);

  return app;
}
