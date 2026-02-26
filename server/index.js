import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import renderRouter from './routes/render.js';
import { initStats, trackAccess, getStats } from './utils/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const isVercel = process.env.VERCEL === '1';
const baseDir = process.env.STORAGE_DIR || (isVercel ? '/tmp' : join(__dirname, '..'));

// Ensure uploads directory exists
const uploadsDir = join(baseDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure output directory exists
const outputDir = join(baseDir, 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

initStats(baseDir);

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const path = req.path || '';
  const isAppPageRequest = path === '/' || path === '/index.html';
  const shouldTrack = req.method === 'GET' && isAppPageRequest;
  if (shouldTrack) {
    trackAccess(req);
  }
  next();
});

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Serve rendered output files
app.use('/output', express.static(outputDir));

// API routes
app.use('/api', renderRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

app.get('/stats', (req, res) => {
  const stats = getStats();
  res.type('text/html').send(`<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ClipBee Stats</title><style>body{font-family:Arial,sans-serif;background:#111;color:#f4f4f4;padding:24px}h1{margin:0 0 16px}li{margin:8px 0}</style></head>
<body><h1>ClipBee Usage Stats</h1><ul>
<li>Live users (last ${stats.activeWindowMinutes} min): <strong>${stats.liveUsers}</strong></li>
<li>Total unique visitors: <strong>${stats.uniqueVisitors}</strong></li>
<li>Total accesses: <strong>${stats.totalAccesses}</strong></li>
<li>Updated at: <strong>${stats.updatedAt}</strong></li>
</ul></body></html>`);
});

// Serve built frontend whenever dist exists (works for Railway/production).
const distPath = join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`ClipBee MaxVid server running on http://localhost:${PORT}`);
  });
}

export default app;
