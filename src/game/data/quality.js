/**
 * Graphics quality presets (Settings → Graphics). The game picks one to
 * start with from the device (settings.js defaultQuality: Low on phones and
 * tablets, Medium on small computers, High otherwise).
 *
 *   shadows    shadow map size in pixels (0: no shadows)
 *   pixelRatio the most screen pixels per CSS pixel (sharpness vs fill cost)
 *   far        how far the camera draws, metres; fog closes in before it
 *   fog        [start, end] of the daylight fog, metres
 *   particles  fraction of sparks, dust and embers drawn
 *   lights     most torch lights lit at once in the Hearth Halls
 *
 * docs/PERFORMANCE.md has what each costs.
 */
export const QUALITY = {
  low: { label: 'Low', shadows: 0, pixelRatio: 1, far: 95, fog: [38, 90], particles: 0.4, lights: 3 },
  medium: { label: 'Medium', shadows: 1024, pixelRatio: 1.5, far: 150, fog: [50, 140], particles: 0.7, lights: 5 },
  high: { label: 'High', shadows: 2048, pixelRatio: 2, far: 220, fog: [55, 170], particles: 1, lights: 8 },
};
