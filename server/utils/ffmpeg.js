import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { join, dirname } from 'path';
import fs from 'fs';

// Set ffmpeg and ffprobe binary paths from the npm installers
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

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
        fs.copyFileSync(normalizedClips[0].path, outputPath);
        cleanupFiles(normalizedClips.map((c) => c.path));
        return resolve(outputPath);
      }

      const minDuration = Math.min(...normalizedClips.map((c) => c.duration));
      const requested = Math.max(0, Number(transitionDuration) || 0);
      const effective = Math.min(requested, Math.max(0, minDuration - 0.05));

      if (effective > 0.01) {
        await renderWithTransitions(normalizedClips, outputPath, getTransitionFilter(transition), effective);
      } else {
        await concatNormalizedClips(normalizedClips, outputPath);
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
        .on('end', () => resolve({ path: outputPath, duration: clipDuration }))
        .on('error', (err) => reject(err))
        .run();
    } catch (err) {
      reject(err);
    }
  });
}

function concatNormalizedClips(normalizedClips, outputPath) {
  return new Promise((resolve, reject) => {
    const outputDir = dirname(outputPath);
    const listPath = join(outputDir, '_concat_list.txt');
    const listContent = normalizedClips.map((c) => `file '${c.path.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(listPath, listContent);

    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
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

function renderWithTransitions(normalizedClips, outputPath, transitionType, transitionDuration) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    normalizedClips.forEach((clip) => {
      command.input(clip.path);
    });

    let videoLabel = '[0:v]';
    let audioLabel = '[0:a]';
    let cumulativeDuration = normalizedClips[0].duration;
    const filterParts = [];

    for (let i = 1; i < normalizedClips.length; i++) {
      const nextVideoLabel = `[${i}:v]`;
      const nextAudioLabel = `[${i}:a]`;
      const videoOut = `[v${i}]`;
      const audioOut = `[a${i}]`;
      const offset = Math.max(0, cumulativeDuration - transitionDuration);

      filterParts.push(
        `${videoLabel}${nextVideoLabel}xfade=transition=${transitionType}:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}${videoOut}`,
      );
      filterParts.push(
        `${audioLabel}${nextAudioLabel}acrossfade=d=${transitionDuration.toFixed(3)}${audioOut}`,
      );

      videoLabel = videoOut;
      audioLabel = audioOut;
      cumulativeDuration += normalizedClips[i].duration - transitionDuration;
    }

    command
      .complexFilter(filterParts)
      .outputOptions([
        '-map', videoLabel,
        '-map', audioLabel,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
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

/**
 * Map user-friendly transition names to FFmpeg xfade transition types.
 */
function getTransitionFilter(transition) {
  const map = {
    fade: 'fade',
    dissolve: 'dissolve',
    slide: 'slideleft',
  };
  return map[transition] || 'fade';
}
