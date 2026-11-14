import type { ImageMetadata } from 'astro';

export type CelestialBody = 'mars' | 'moon';
export type ArtifactType = 'rover' | 'lander' | 'helicopter' | 'instrument-station' | 'other';
export type VerificationStatus = 'verified' | 'pending';

export interface ArtifactSite {
  name: string;
  lat: number | 'pending';
  lon: number | 'pending';
  description: string;
}

export interface ArtifactLegacyItem {
  finding: string;
  sourceTitle: string;
  sourceUrl: string;
}

export interface ArtifactSource {
  title: string;
  url: string;
  accessedDate: string;
}

export interface ArtifactImage {
  src: string;
  width: number;
  height: number;
  metadata?: ImageMetadata;
  alt: string;
  credit: string;
  originalUrl: string;
}

export interface Artifact {
  id: string;
  name: string;
  nssdcId: string;
  agency: string;
  body: CelestialBody;
  type: ArtifactType;
  launchDate: string;
  lastContactDate: string;
  site: ArtifactSite;
  endCause: string;
  scientificValue: string;
  legacy: ArtifactLegacyItem[];
  verification: VerificationStatus;
  verificationNote?: string;
  sources: ArtifactSource[];
  image?: ArtifactImage;
  featured: boolean;
}

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  rover: 'Rover',
  lander: 'Lander',
  helicopter: 'Helicopter',
  'instrument-station': 'Instrument Station',
  other: 'Other',
};

/**
 * Formats decimal coordinates as clean hemisphere labels (e.g. `1.9462° S, 5.5266° W`).
 */
export function formatCoordinates(lat: number | 'pending', lon: number | 'pending'): string {
  if (lat === 'pending' || lon === 'pending') {
    return 'COORDINATES PENDING VERIFICATION';
  }
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}
