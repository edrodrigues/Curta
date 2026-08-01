'use client';

import { useEffect, useRef } from 'react';

const PALETTE = ['#d8434c', '#e4a83c', '#3fa173', '#7d6ea8', '#4a90c4'];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function CanvasThumb({ seedText }: { seedText: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 180;
    if (w <= 0 || h <= 0) return;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const h1 = hashStr(seedText || 'curta');
    const c1 = PALETTE[h1 % PALETTE.length];
    const c2 = PALETTE[(h1 >> 3) % PALETTE.length];
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1b1620');
    grad.addColorStop(1, '#2c2333');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const n = 5 + (h1 % 4);
    for (let i = 0; i < n; i++) {
      const seed = (h1 * (i + 7)) >>> 0;
      const x = ((seed % 1000) / 1000) * w;
      const y = (((seed >> 4) % 1000) / 1000) * h;
      const r = Math.max(1, 10 + ((seed >> 8) % 40));
      ctx.fillStyle = i % 2 === 0 ? c1 : c2;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [seedText]);

  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

export function KineticPreview({ script, title }: { script: string; title: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 360;
    if (w <= 0 || h <= 0) return;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const words = (script || 'Sua ideia em vídeo').split(/\s+/).filter(Boolean);
    if (!words.length) words.push('Sua', 'ideia', 'em', 'vídeo');
    let frame = 0;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const h1 = hashStr((title || '') + (script || ''));
    const accent = PALETTE[h1 % PALETTE.length];

    let raf = 0;
    function draw() {
      if (!ctx) return;
      ctx.fillStyle = '#1b1620';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      const idx = reduced ? 0 : Math.floor(frame / 55) % words.length;
      const word = words[idx];
      ctx.font = "700 " + Math.min(56, 320 / Math.max(4, word.length)) + "px 'Fjalla One', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const pulse = reduced ? 1 : 1 + 0.04 * Math.sin(frame / 14);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = accent;
      ctx.fillText(word, 0, 0);
      ctx.restore();
      ctx.fillStyle = 'rgba(241,236,225,0.65)';
      ctx.font = "12px ui-monospace, 'Consolas', monospace";
      ctx.textAlign = 'left';
      ctx.fillText((title || 'PRÉVIA').toUpperCase(), 16, h - 16);
      frame++;
      if (!reduced) raf = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [script, title]);

  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />;
}