import { Router } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { mergeClips, getVideoInfo } from '../utils/ffmpeg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isVercel = process.env.VERCEL === '1';
const baseDir = process.env.STORAGE_DIR || (isVercel ? '/tmp' : join(__dirname, '..', '..'));

const uploadsDir = join(baseDir, 'uploads');
const outputDir = join(baseDir, 'output');
const MAX_MEDIA_AGE_MS = 15 * 60 * 1000;

// Ensure directories exist
[uploadsDir, outputDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionDir = join(uploadsDir, req.sessionId || 'default');
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per file
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/avi'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const router = Router();

// Middleware to assign session ID
router.use((req, res, next) => {
  req.sessionId = req.headers['x-session-id'] || uuidv4();
  next();
});

function deleteFileSafe(path) {
  try { fs.unlinkSync(path); } catch { /* noop */ }
}

function clearDirectoryRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      clearDirectoryRecursive(fullPath);
      try { fs.rmdirSync(fullPath); } catch { /* noop */ }
    } else {
      deleteFileSafe(fullPath);
    }
  });
}

function cleanupExpiredMedia(dir, maxAgeMs) {
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach((entry) => {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        try {
          const remaining = fs.readdirSync(fullPath);
          if (remaining.length === 0) fs.rmdirSync(fullPath);
        } catch { /* noop */ }
        return;
      }
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
        }
      } catch { /* noop */ }
    });
  };
  walk(dir);
}

function runMediaCleanupSweep() {
  cleanupExpiredMedia(uploadsDir, MAX_MEDIA_AGE_MS);
  cleanupExpiredMedia(outputDir, MAX_MEDIA_AGE_MS);
}

runMediaCleanupSweep();
setInterval(runMediaCleanupSweep, 5 * 60 * 1000);

// Upload clips
router.post('/upload', upload.array('clips', 20), async (req, res) => {
  try {
    const files = req.files || [];
    const results = [];

    for (const file of files) {
      try {
        const info = await getVideoInfo(file.path);
        results.push({
          id: uuidv4(),
          filename: file.originalname,
          path: file.path,
          size: file.size,
          duration: info.duration,
          width: info.width,
          height: info.height,
          codec: info.codec,
        });
      } catch {
        results.push({
          id: uuidv4(),
          filename: file.originalname,
          path: file.path,
          size: file.size,
          duration: 0,
          width: 0,
          height: 0,
        });
      }
    }

    res.json({ files: results, sessionId: req.sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Render / merge clips — returns a URL to the rendered video for preview + download
router.post('/render', upload.array('clips', 20), async (req, res) => {
  try {
    runMediaCleanupSweep();
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No clips provided' });
    }

    const {
      transition = 'fade',
      transitionDuration = '0.5',
      format = 'mp4',
      quality = '1080p',
      fps = '30',
      segments,
    } = req.body;

    const inputPaths = files.map((f) => f.path);
    const outputFilename = `clipbee-${uuidv4()}.${format}`;
    const outputPath = join(outputDir, outputFilename);

    // Quality to resolution mapping
    const qualityMap = {
      '1080p': { width: 1920, height: 1080 },
      '720p': { width: 1280, height: 720 },
      '480p': { width: 854, height: 480 },
    };

    const resolution = qualityMap[quality] || qualityMap['1080p'];

    console.log(`Starting render: ${files.length} clips, ${quality}, ${fps}fps, format: ${format}`);

    await mergeClips(inputPaths, outputPath, {
      transition,
      transitionDuration: parseFloat(transitionDuration),
      format,
      fps: parseInt(fps, 10),
      width: resolution.width,
      height: resolution.height,
      segments: (() => {
        try {
          const parsed = JSON.parse(segments || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
    });

    console.log(`Render complete: ${outputFilename}`);

    // Cleanup uploaded source files
    files.forEach((f) => {
      deleteFileSafe(f.path);
    });

    // Return JSON with the video URL so the client can preview + download
    const videoUrl = `/output/${outputFilename}`;
    res.json({ url: videoUrl, filename: outputFilename });

    // Schedule cleanup of the output file after 15 minutes
    setTimeout(() => {
      deleteFileSafe(outputPath);
    }, MAX_MEDIA_AGE_MS);
  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve rendered output files
router.get('/output/:filename', (req, res) => {
  const filePath = join(outputDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

// Get video info
router.post('/info', upload.single('clip'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const info = await getVideoInfo(req.file.path);
    res.json(info);

    // Cleanup
    setTimeout(() => {
      deleteFileSafe(req.file.path);
    }, 1000);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cleanup', (req, res) => {
  try {
    const sessionDir = join(uploadsDir, req.sessionId || 'default');
    clearDirectoryRecursive(sessionDir);
    try { fs.rmdirSync(sessionDir); } catch { /* noop */ }
    runMediaCleanupSweep();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
