import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import renderRouter from './routes/render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const isVercel = process.env.VERCEL === '1';
const baseDir = isVercel ? '/tmp' : join(__dirname, '..');

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

app.use(cors());
app.use(express.json());

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

// In production, serve the built frontend
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist');
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
