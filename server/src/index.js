import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import studentsRouter from './routes/students.js';
import coursesRouter from './routes/courses.js';
import batchesRouter from './routes/batches.js';
import enrollmentsRouter from './routes/enrollments.js';
import paymentsRouter from './routes/payments.js';
import remindersRouter from './routes/reminders.js';
import attendanceRouter from './routes/attendance.js';
import statsRouter from './routes/stats.js';
import importsRouter from './routes/imports.js';
import webhooksRouter from './routes/webhooks.js';
import shareRouter from './routes/share.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import { requireAuth, requireRole } from './services/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5001;

const app = express();

// Behind Railway's proxy. Required for a correct `req.ip`: without it every request looks like it
// comes from the proxy, so all users share one rate-limit bucket and an attacker could lock
// everyone out. Defaults to 1 hop, which is a no-op when running locally (no X-Forwarded-For).
// Set TRUST_PROXY=false to disable, or to a number of hops to override.
const trustProxy = process.env.TRUST_PROXY ?? '1';
if (trustProxy !== 'false' && trustProxy !== '0') {
  app.set('trust proxy', trustProxy === 'true' ? 1 : Number(trustProxy) || trustProxy);
}

// Security headers (helmet). Notable choices:
// - `contentSecurityPolicy: false` - the receipt page ships a large inline <style> block plus an
//   inline `onclick` print handler, and the Vite bundle inlines assets, so a strict CSP would
//   break printing and fonts. Worth adding later with 'unsafe-inline' scoped deliberately.
// - `strictTransportSecurity` matters now that COOKIE_SECURE=true: without HSTS a browser can
//   still be downgraded to http:// and the session cookie sent in the clear.
// - `frameguard` denies framing, which stops clickjacking the admin UI.
// - `noSniff` plus removing `X-Powered-By` avoids advertising the stack and MIME-sniffing files.
app.use(
  helmet({
    contentSecurityPolicy: false,
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  }),
);

app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '5mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

app.use('/share', shareRouter);

app.use('/api/auth', authRouter);
app.use('/api/webhooks', webhooksRouter);

app.use('/api', requireAuth);

app.use('/api/students', studentsRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/batches', batchesRouter);
app.use('/api/enrollments', enrollmentsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/stats', statsRouter);
app.use('/api/imports', importsRouter);
app.use('/api/users', usersRouter);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const message = status === 400 ? 'Invalid request' : 'Internal server error';
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`CRM server listening on http://localhost:${PORT}`);
});