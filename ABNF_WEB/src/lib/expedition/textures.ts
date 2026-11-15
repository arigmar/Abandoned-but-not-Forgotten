import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { createPrng, hashStringSeed } from './utils';

/**
 * Generates a tileable procedural regolith texture with wind streaks/basalt
 * tonal variation, fine mineral speckle grains, and radial-gradient craters
 * for Mars or the Moon. Used for both diffuse `map` and `bumpMap` detail.
 */
export function createPlanetaryRegolithTexture(
  body: 'mars' | 'moon',
  repeatCount = 24,
): CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const rand = createPrng(hashStringSeed(`abnf-regolith-${body}-v2`));
  const isMars = body === 'mars';

  // Base regolith coat (below pure-light ceiling)
  ctx.fillStyle = isMars ? '#b54922' : '#788292';
  ctx.fillRect(0, 0, size, size);

  if (isMars) {
    // Wind-rippled Martian aeolian dune bands and iron-oxide sediment patches
    for (let i = 0; i < 48; i++) {
      const y = rand() * size;
      const bandH = 8 + rand() * 34;
      ctx.fillStyle =
        i % 2 === 0 ? 'rgba(138, 46, 18, 0.16)' : 'rgba(218, 122, 66, 0.12)';
      ctx.fillRect(0, y, size, bandH);
    }
    for (let i = 0; i < 36; i++) {
      const px = rand() * size;
      const py = rand() * size;
      const pr = 26 + rand() * 75;
      const grad = ctx.createRadialGradient(px, py, pr * 0.15, px, py, pr);
      grad.addColorStop(
        0,
        rand() > 0.45 ? 'rgba(92, 34, 18, 0.22)' : 'rgba(205, 112, 58, 0.16)',
      );
      grad.addColorStop(1, 'rgba(181, 73, 34, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // 8,500 fine basalt & ochre mineral grains
    const marsGrains = [
      'rgba(104, 34, 16, 0.28)',
      'rgba(74, 24, 12, 0.24)',
      'rgba(217, 119, 54, 0.22)',
      'rgba(226, 149, 90, 0.18)',
      'rgba(148, 56, 28, 0.26)',
    ];
    for (let i = 0; i < 8500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 0.7 + rand() * 3.4;
      ctx.fillStyle = marsGrains[Math.floor(rand() * marsGrains.length)];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 80 weathered Martian hollows and micro-craters
    for (let i = 0; i < 80; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const radius = 8 + rand() * 38;
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.18, cx, cy, radius);
      grad.addColorStop(0, 'rgba(72, 26, 14, 0.36)');
      grad.addColorStop(0.7, 'rgba(130, 50, 22, 0.18)');
      grad.addColorStop(0.88, 'rgba(216, 126, 72, 0.18)');
      grad.addColorStop(1, 'rgba(181, 73, 34, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Lunar mare basalt mottling & regolith tonal patches
    for (let i = 0; i < 42; i++) {
      const px = rand() * size;
      const py = rand() * size;
      const pr = 28 + rand() * 82;
      const grad = ctx.createRadialGradient(px, py, pr * 0.15, px, py, pr);
      grad.addColorStop(
        0,
        rand() > 0.45 ? 'rgba(68, 75, 88, 0.24)' : 'rgba(150, 160, 178, 0.16)',
      );
      grad.addColorStop(1, 'rgba(120, 130, 146, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // 9,500 lunar regolith dust grains & breccia fragments
    const moonGrains = [
      'rgba(62, 69, 82, 0.30)',
      'rgba(48, 54, 65, 0.26)',
      'rgba(156, 166, 184, 0.22)',
      'rgba(178, 188, 206, 0.18)',
      'rgba(92, 101, 116, 0.24)',
    ];
    for (let i = 0; i < 9500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 0.6 + rand() * 3.1;
      ctx.fillStyle = moonGrains[Math.floor(rand() * moonGrains.length)];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 90 multi-scale impact craters with shaded bowls & bright ejecta rims
    for (let i = 0; i < 90; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const radius = 6 + rand() * 38;
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.18, cx, cy, radius);
      grad.addColorStop(0, 'rgba(42, 47, 56, 0.42)');
      grad.addColorStop(0.68, 'rgba(72, 79, 92, 0.20)');
      grad.addColorStop(0.86, 'rgba(196, 205, 220, 0.22)');
      grad.addColorStop(1, 'rgba(120, 130, 146, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatCount, repeatCount);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
