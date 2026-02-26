import fs from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

let statsFilePath = null;
let state = {
  totalAccesses: 0,
  uniqueVisitors: 0,
  knownVisitors: {},
  activeVisitors: {},
};

function safeLoad() {
  if (!statsFilePath || !fs.existsSync(statsFilePath)) return;
  try {
    const raw = fs.readFileSync(statsFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    state = {
      totalAccesses: Number(parsed.totalAccesses) || 0,
      uniqueVisitors: Number(parsed.uniqueVisitors) || 0,
      knownVisitors: parsed.knownVisitors || {},
      activeVisitors: parsed.activeVisitors || {},
    };
  } catch {
    // Ignore malformed file and continue with defaults.
  }
}

function safeSave() {
  if (!statsFilePath) return;
  try {
    fs.writeFileSync(statsFilePath, JSON.stringify(state), 'utf8');
  } catch {
    // Best-effort persistence only.
  }
}

function getVisitorId(req) {
  const sessionId = req.headers['x-session-id'] || '';
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString();
  const userAgent = req.headers['user-agent'] || '';
  const raw = `${sessionId}|${ip}|${userAgent}`;
  return createHash('sha1').update(raw).digest('hex');
}

function sweepInactive(now) {
  Object.entries(state.activeVisitors).forEach(([visitorId, lastSeen]) => {
    if (now - Number(lastSeen) > ACTIVE_WINDOW_MS) {
      delete state.activeVisitors[visitorId];
    }
  });
}

export function initStats(baseDir) {
  statsFilePath = join(baseDir, 'stats.json');
  safeLoad();
  sweepInactive(Date.now());
  safeSave();
}

export function trackAccess(req) {
  const now = Date.now();
  const visitorId = getVisitorId(req);

  state.totalAccesses += 1;
  if (!state.knownVisitors[visitorId]) {
    state.knownVisitors[visitorId] = now;
    state.uniqueVisitors += 1;
  }
  state.activeVisitors[visitorId] = now;

  sweepInactive(now);
  safeSave();
}

export function getStats() {
  const now = Date.now();
  sweepInactive(now);
  return {
    totalAccesses: state.totalAccesses,
    uniqueVisitors: state.uniqueVisitors,
    liveUsers: Object.keys(state.activeVisitors).length,
    activeWindowMinutes: ACTIVE_WINDOW_MS / 60000,
    updatedAt: new Date(now).toISOString(),
  };
}
