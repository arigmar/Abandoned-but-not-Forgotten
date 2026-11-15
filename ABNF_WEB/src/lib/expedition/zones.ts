import type { ExpeditionArtifact } from './types';

export interface MonumentZonePlacement {
  artifact: ExpeditionArtifact;
  x: number;
  z: number;
  zoneLabel: string;
}

export const LANDER_PAD_POSITION = { x: -11, z: 54 } as const;
export const ROVER_SPAWN_POSITION = { x: 0, z: 62 } as const;

const FIELD_HALF_X = 52;
const FIELD_HALF_Z = 40;
const MIN_SITE_SEPARATION = 30;
const MIN_SHIP_SEPARATION = 30;

/**
 * Projects each artifact's real planetary lat/lon onto drivable surface coordinates:
 * +X = East (+lon), -X = West (-lon), -Z = North (+lat), +Z = South (-lat).
 */
export function computePlanetMonumentPlacements(
  artifacts: ExpeditionArtifact[],
  body: 'mars' | 'moon',
): MonumentZonePlacement[] {
  const bodyArtifacts = artifacts.filter((item) => item.body === body);
  if (bodyArtifacts.length === 0) return [];

  const coords = bodyArtifacts.map((item, idx) => ({
    artifact: item,
    lat: typeof item.site.lat === 'number' ? item.site.lat : idx * 12,
    lon: typeof item.site.lon === 'number' ? item.site.lon : (idx - 1) * 35,
  }));

  if (coords.length === 1) {
    return [
      {
        artifact: coords[0].artifact,
        x: 0,
        z: 0,
        zoneLabel: coords[0].artifact.site.name,
      },
    ];
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lon < minLon) minLon = c.lon;
    if (c.lon > maxLon) maxLon = c.lon;
  }

  const midLat = (minLat + maxLat) * 0.5;
  const midLon = (minLon + maxLon) * 0.5;
  const halfSpanLat = Math.max(2, (maxLat - minLat) * 0.5);
  const halfSpanLon = Math.max(2, (maxLon - minLon) * 0.5);

  const placements: MonumentZonePlacement[] = coords.map((c) => ({
    artifact: c.artifact,
    x: Math.round(((c.lon - midLon) / halfSpanLon) * FIELD_HALF_X * 10) / 10,
    z: Math.round(((midLat - c.lat) / halfSpanLat) * FIELD_HALF_Z * 10) / 10,
    zoneLabel: c.artifact.site.name,
  }));

  // Guard minimum separation between monuments and from the landed ship / spawn apron
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < placements.length; i++) {
      const a = placements[i];
      for (let j = i + 1; j < placements.length; j++) {
        const b = placements[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        if (dist < MIN_SITE_SEPARATION) {
          const push = (MIN_SITE_SEPARATION - dist) * 0.5;
          a.x -= (dx / dist) * push;
          a.z -= (dz / dist) * push;
          b.x += (dx / dist) * push;
          b.z += (dz / dist) * push;
        }
      }

      const sdx = a.x - LANDER_PAD_POSITION.x;
      const sdz = a.z - LANDER_PAD_POSITION.z;
      const sdist = Math.hypot(sdx, sdz) || 0.001;
      if (sdist < MIN_SHIP_SEPARATION) {
        const push = MIN_SHIP_SEPARATION - sdist;
        a.x += (sdx / sdist) * push;
        a.z += (sdz / sdist) * push;
      }
    }
  }

  return placements;
}

export function computeAzimuthDeg(fromX: number, fromZ: number, toX: number, toZ: number): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  return Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI) % 360 + 360) % 360);
}

export function azToCompass8(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((deg % 360) / 45) % 8] ?? 'N';
}
