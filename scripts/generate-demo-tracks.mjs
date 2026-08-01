import fs from 'node:fs';
import path from 'node:path';

const sampleRate = 22050;
const duration = 30;
const outputDir = path.join(process.cwd(), 'public', 'audio');

const tracks = [
  { file: 'ambiente-calmo.wav', bpm: 78, roots: [220, 196, 174.61, 196], scale: [1, 1.122, 1.26, 1.498, 1.682], pad: 0.075, lead: 0.045, bass: 0.09, percussion: 0.018 },
  { file: 'corporativo.wav', bpm: 108, roots: [196, 246.94, 220, 293.66], scale: [1, 1.122, 1.26, 1.335, 1.498], pad: 0.055, lead: 0.055, bass: 0.12, percussion: 0.035 },
  { file: 'upbeat.wav', bpm: 124, roots: [261.63, 329.63, 293.66, 392], scale: [1, 1.122, 1.26, 1.498, 1.682, 1.888], pad: 0.04, lead: 0.07, bass: 0.14, percussion: 0.05 },
  { file: 'cinematografico.wav', bpm: 84, roots: [146.83, 174.61, 196, 130.81], scale: [1, 1.189, 1.335, 1.498, 1.782], pad: 0.105, lead: 0.035, bass: 0.16, percussion: 0.025 },
];

function wave(freq, time, phase = 0) {
  return Math.sin(Math.PI * 2 * freq * time + phase);
}

function noise(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function envelope(time, length) {
  const fadeIn = Math.min(1, time / 1.2);
  const fadeOut = Math.min(1, Math.max(0, (length - time) / 1.8));
  return fadeIn * fadeOut;
}

function noteEnvelope(time, length) {
  return Math.min(1, time / 0.025) * Math.min(1, Math.max(0, (length - time) / 0.08));
}

function sampleTrack(track, time, index) {
  const beat = 60 / track.bpm;
  const bar = beat * 4;
  const barIndex = Math.floor(time / bar) % track.roots.length;
  const root = track.roots[barIndex];
  const localBar = time % bar;
  const beatIndex = Math.floor(localBar / beat);
  const beatTime = localBar % beat;
  const eighth = beat / 2;
  const eighthIndex = Math.floor(localBar / eighth);
  const rootTime = time % bar;
  const ambient = envelope(time, duration);
  let value = 0;

  value += track.pad * (
    wave(root, time, 0.2) * 0.7 +
    wave(root * 1.26, time, 1.1) * 0.35 +
    wave(root * 1.498, time, 2.4) * 0.25
  );

  if (beatIndex === 0 && beatTime < beat * 0.72) {
    const bassShape = Math.exp(-beatTime * 7);
    value += track.bass * bassShape * wave(root / 2, beatTime, 0.1);
  }

  const leadIndex = (barIndex * 2 + eighthIndex) % track.scale.length;
  const leadFrequency = root * track.scale[leadIndex];
  const leadTime = localBar % eighth;
  value += track.lead * noteEnvelope(leadTime, eighth * 0.92) * wave(leadFrequency, leadTime, barIndex * 0.4);

  if (beatIndex === 0 || beatIndex === 2) {
    value += track.percussion * Math.exp(-beatTime * 24) * wave(72, beatTime);
  }
  if (beatIndex === 1 || beatIndex === 3) {
    value += track.percussion * 0.7 * Math.exp(-beatTime * 35) * noise(index);
  }

  const shimmer = 0.012 * wave(root * 2.01, rootTime) * wave(0.17, time);
  return Math.max(-1, Math.min(1, (value + shimmer) * ambient));
}

function writeWav(file, track) {
  const frameCount = sampleRate * duration;
  const dataSize = frameCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < frameCount; i += 1) {
    const value = Math.round(sampleTrack(track, i / sampleRate, i) * 0x7fff);
    buffer.writeInt16LE(value, 44 + i * 2);
  }

  fs.writeFileSync(path.join(outputDir, file), buffer);
}

fs.mkdirSync(outputDir, { recursive: true });
tracks.forEach((track) => writeWav(track.file, track));
