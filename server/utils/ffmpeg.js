import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { join, dirname } from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

// Set ffmpeg and ffprobe binary paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeStatic.path);

let supportedXfadeTransitionsCache = null;

/**
 * Map output format to appropriate video/audio codecs and encoding options.
 */
function getCodecsForFormat(format) {
  switch (format) {
    case 'webm':
      return {
        vcodec: 'libvpx-vp9',
        acodec: 'libopus',
        opts: ['-b:v', '2M', '-cpu-used', '4', '-row-mt', '1', '-b:a', '192k'],
      };
    case 'avi':
      return {
        vcodec: 'mpeg4',
        acodec: 'libmp3lame',
        opts: ['-q:v', '5', '-b:a', '192k'],
      };
    case 'mov':
    case 'mp4':
    default:
      return {
        vcodec: 'libx264',
        acodec: 'aac',
        opts: ['-preset', 'fast', '-b:a', '192k'],
      };
  }
}

/**
 * Get video file info (duration, resolution, codec).
 */
export function getVideoInfo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');
      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        codec: videoStream?.codec_name || 'unknown',
        bitrate: metadata.format.bit_rate || 0,
        size: metadata.format.size || 0,
        hasAudio: !!audioStream,
      });
    });
  });
}

/**
 * Merge multiple video clips into a single output video.
 * Clips are normalized first, then either concatenated or transition-blended.
 */
export function mergeClips(inputPaths, outputPath, options = {}) {
  const {
    transition = 'fade',
    transitionDuration = 0.5,
    format = 'mp4',
    fps = 30,
    width = 1920,
    height = 1080,
    segments = [],
  } = options;

  return new Promise(async (resolve, reject) => {
    try {
      if (inputPaths.length === 0) {
        return reject(new Error('No input files'));
      }

      const outputDir = dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const normalizedClips = [];
      for (let i = 0; i < inputPaths.length; i++) {
        const normPath = join(outputDir, `_norm_${i}.mp4`);
        const segment = segments[i] || {};
        const normalized = await normalizeClip(inputPaths[i], normPath, width, height, fps, segment);
        normalizedClips.push(normalized);
      }

      if (normalizedClips.length === 1) {
        if (!format || format === 'mp4' || format === 'mov') {
          fs.copyFileSync(normalizedClips[0].path, outputPath);
        } else {
          await concatNormalizedClips(normalizedClips, outputPath, format);
        }
        cleanupFiles(normalizedClips.map((c) => c.path));
        return resolve(outputPath);
      }

      const minDuration = Math.min(...normalizedClips.map((c) => c.duration));
      const requested = Math.max(0, Number(transitionDuration) || 0);
      const effective = Math.min(requested, Math.max(0, minDuration - 0.05));

      if (effective > 0.01) {
        try {
          const safeTransition = getSafeTransitionFilter(transition);
          await renderWithTransitions(normalizedClips, outputPath, safeTransition, effective, format);
        } catch (transitionErr) {
          // Some ffmpeg builds reject specific transition graphs/types; fallback to reliable concat.
          console.warn('Transition render failed, falling back to concat:', transitionErr?.message || transitionErr);
          await concatNormalizedClips(normalizedClips, outputPath, format);
        }
      } else {
        await concatNormalizedClips(normalizedClips, outputPath, format);
      }

      cleanupFiles(normalizedClips.map((c) => c.path));
      resolve(outputPath);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Normalize a single clip: scale to target resolution, set fps,
 * and ensure it has an audio stream (add silent audio if missing).
 */
function normalizeClip(inputPath, outputPath, width, height, fps, segment = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const info = await getVideoInfo(inputPath);
      const clipStart = Math.max(0, Number(segment.start || 0));
      const clipEnd = Math.max(clipStart, Number(segment.end || info.duration || 0));
      const clipDuration = Math.max(0.05, clipEnd - clipStart);

      const command = ffmpeg(inputPath);
      if (clipStart > 0) {
        command.inputOptions(['-ss', clipStart.toFixed(3)]);
      }
      command.duration(clipDuration);

      if (!info.hasAudio) {
        command.input('anullsrc=channel_layout=stereo:sample_rate=44100');
        command.inputOptions(['-f', 'lavfi']);
      }

      command
        .outputOptions([
          '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '44100',
          '-ac', '2',
          ...(info.hasAudio ? [] : ['-shortest']),
          '-movflags', '+faststart',
        ])
        .output(outputPath)
        .on('end', async () => {
          try {
            const outInfo = await getVideoInfo(outputPath);
            resolve({ path: outputPath, duration: outInfo.duration || clipDuration });
          } catch {
            resolve({ path: outputPath, duration: clipDuration });
          }
        })
        .on('error', (err) => reject(err))
        .run();
    } catch (err) {
      reject(err);
    }
  });
}

function concatNormalizedClips(normalizedClips, outputPath, format = 'mp4') {
  return new Promise((resolve, reject) => {
    const codecs = getCodecsForFormat(format);
    const outputDir = dirname(outputPath);
    const listPath = join(outputDir, '_concat_list.txt');
    const listContent = normalizedClips.map((c) => `file '${c.path.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(listPath, listContent);

    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c:v', codecs.vcodec,
        ...codecs.opts,
        '-c:a', codecs.acodec,
        ...(format === 'mp4' || format === 'mov' ? ['-movflags', '+faststart'] : []),
      ])
      .output(outputPath)
      .on('end', () => {
        cleanupFiles([listPath]);
        resolve(outputPath);
      })
      .on('error', (err) => {
        cleanupFiles([listPath]);
        reject(err);
      })
      .run();
  });
}

function renderWithTransitions(normalizedClips, outputPath, transitionType, transitionDuration, format = 'mp4') {
  return new Promise((resolve, reject) => {
    const codecs = getCodecsForFormat(format);
    const command = ffmpeg();
    normalizedClips.forEach((clip) => {
      command.input(clip.path);
    });

    let videoLabel = '0:v';
    let cumulativeDuration = normalizedClips[0].duration;
    const filterParts = [];

    for (let i = 1; i < normalizedClips.length; i++) {
      const nextVideoLabel = `${i}:v`;
      const videoOut = `v${i}`;
      // Safety margin of 0.02s prevents offset from overshooting actual clip end
      // (probed durations can differ slightly from frame-exact durations)
      const offset = Math.max(0, cumulativeDuration - transitionDuration - 0.02);

      filterParts.push(
        `[${videoLabel}][${nextVideoLabel}]xfade=transition=${transitionType}:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}[${videoOut}]`,
      );

      videoLabel = videoOut;
      // Track actual intermediate output duration (xfade output = offset + next clip duration)
      cumulativeDuration = offset + normalizedClips[i].duration;
    }

    // Audio: keep a stable concat chain to avoid crossfade filter incompatibilities.
    const audioInputs = normalizedClips.map((_, i) => `[${i}:a]`).join('');
    filterParts.push(`${audioInputs}concat=n=${normalizedClips.length}:v=0:a=1[aout]`);

    command
      .complexFilter(filterParts)
      .outputOptions([
        '-map', `[${videoLabel}]`,
        '-map', '[aout]',
        '-c:v', codecs.vcodec,
        ...codecs.opts,
        '-c:a', codecs.acodec,
        ...(format === 'mp4' || format === 'mov' ? ['-movflags', '+faststart'] : []),
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Cleanup temporary files, ignoring errors.
 */
function cleanupFiles(paths) {
  for (const p of paths) {
    try { fs.unlinkSync(p); } catch { /* noop */ }
  }
}

function getSafeTransitionFilter(transition) {
  const requested = getTransitionFilter(transition);
  const supported = getSupportedXfadeTransitions();
  return supported.has(requested) ? requested : 'fade';
}

function getSupportedXfadeTransitions() {
  if (supportedXfadeTransitionsCache) return supportedXfadeTransitionsCache;
  try {
    const result = spawnSync(ffmpegPath, ['-hide_banner', '-h', 'filter=xfade'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const matches = output.match(/\b[a-z][a-z0-9_]*\b/g) || [];
    supportedXfadeTransitionsCache = new Set(matches);
    if (!supportedXfadeTransitionsCache.has('fade')) {
      supportedXfadeTransitionsCache.add('fade');
    }
  } catch {
    supportedXfadeTransitionsCache = new Set(['fade', 'dissolve', 'slideleft', 'slideright', 'wipeleft', 'wiperight']);
  }
  return supportedXfadeTransitionsCache;
}

function getTransitionFilter(transition) {
  const map = {
    fade: 'fade',
    dissolve: 'dissolve',
    slideleft: 'slideleft',
    slideright: 'slideright',
    wipeleft: 'wipeleft',
    wiperight: 'wiperight',
  };
  return map[transition] || 'fade';
}
