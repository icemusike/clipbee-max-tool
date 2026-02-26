import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Set ffmpeg and ffprobe binary paths from the npm installers
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
 * Uses simple concat demuxer for reliability (no complex filter issues).
 */
export function mergeClips(inputPaths, outputPath, options = {}) {
  const {
    format = 'mp4',
    fps = 30,
    width = 1920,
    height = 1080,
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

      // For any number of clips, use a two-step approach:
      // Step 1: Normalize all clips to same resolution/codec/fps with a silent audio track
      // Step 2: Concat them all together

      const normalizedPaths = [];

      for (let i = 0; i < inputPaths.length; i++) {
        const normPath = join(outputDir, `_norm_${i}.mp4`);
        normalizedPaths.push(normPath);
        await normalizeClip(inputPaths[i], normPath, width, height, fps);
      }

      if (normalizedPaths.length === 1) {
        // Only one clip — just copy it to output
        fs.copyFileSync(normalizedPaths[0], outputPath);
        cleanupFiles(normalizedPaths);
        return resolve(outputPath);
      }

      // Create a concat list file for ffmpeg concat demuxer
      const listPath = join(outputDir, '_concat_list.txt');
      const listContent = normalizedPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n');
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
          cleanupFiles([...normalizedPaths, listPath]);
          resolve(outputPath);
        })
        .on('error', (err) => {
          cleanupFiles([...normalizedPaths, listPath]);
          reject(err);
        })
        .run();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Normalize a single clip: scale to target resolution, set fps,
 * and ensure it has an audio stream (add silent audio if missing).
 */
function normalizeClip(inputPath, outputPath, width, height, fps) {
  return new Promise(async (resolve, reject) => {
    try {
      const info = await getVideoInfo(inputPath);

      const command = ffmpeg(inputPath);

      // If no audio, add a silent audio source
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
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err))
        .run();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Cleanup temporary files, ignoring errors.
 */
function cleanupFiles(paths) {
  for (const p of paths) {
    try { fs.unlinkSync(p); } catch { }
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
    wipe: 'wipeleft',
    zoom: 'zoomin',
    blur: 'fadeblack',
  };
  return map[transition] || 'fade';
}

/**
 * Generate a thumbnail from a video at a given timestamp.
 */
export function generateThumbnail(videoPath, outputPath, timestamp = 1) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestamp],
        filename: 'thumb.jpg',
        folder: dirname(outputPath),
        size: '160x90',
      })
      .on('end', () => resolve(outputPath))
      .on('error', reject);
  });
}
