import {
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type Material,
} from 'three';
import type { BodyEnvironmentPalette } from './palette';

export function hashStringSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function shortestAngleDelta(current: number, target: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function disposeObjectTree(root: Object3D): void {
  const disposeMaterial = (mat: Material) => {
    mat.dispose();
  };

  root.traverse((obj) => {
    if ('geometry' in obj && obj.geometry && typeof obj.geometry === 'object') {
      const geom = obj.geometry as { dispose?: () => void };
      geom.dispose?.();
    }
    if ('material' in obj && obj.material) {
      if (Array.isArray(obj.material)) {
        for (const m of obj.material) disposeMaterial(m as Material);
      } else {
        disposeMaterial(obj.material as Material);
      }
    }
  });
}

export function buildProceduralCelestialSphere(
  body: 'mars' | 'moon',
  env: BodyEnvironmentPalette,
  radius: number,
  detail = 4,
): Mesh {
  const geometry = new IcosahedronGeometry(radius, detail);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cDark = env.planetDark;
  const cLight = env.planetLight;
  const cFrost = new Color('#BCC8DC');
  const tmp = new Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / radius;
    const y = pos.getY(i) / radius;
    const z = pos.getZ(i) / radius;

    const wave =
      Math.sin(x * 4.3 + z * 2.7) * 0.35 +
      Math.cos(y * 5.2 - x * 3.1) * 0.28 +
      Math.sin((x + y + z) * 9.0) * 0.14;

    if (body === 'mars') {
      const bandT = clampNumber(0.5 + wave, 0, 1);
      tmp.copy(cDark).lerp(cLight, bandT);
      if (Math.abs(y) > 0.86) {
        const capT = clampNumber((Math.abs(y) - 0.86) * 5.5, 0, 0.72);
        tmp.lerp(cFrost, capT);
      }
    } else {
      // Lunar Maria darkened patches vs brighter highland craters
      const mariaMask = clampNumber(Math.sin(x * 2.6 - z * 1.9 + wave * 1.4) * 0.5 + 0.5, 0, 1);
      tmp.copy(cDark).lerp(cLight, mariaMask);
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.03,
    flatShading: true,
  });

  return new Mesh(geometry, material);
}
