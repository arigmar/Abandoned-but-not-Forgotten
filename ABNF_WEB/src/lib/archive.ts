import { getImage } from 'astro:assets';
import { getCollection, getEntry } from 'astro:content';
import { SITE } from '../config/site';
import {
  ARTIFACT_TYPE_LABELS,
  formatCoordinates,
  type Artifact,
  type ArtifactImage,
  type ArtifactLegacyItem,
  type ArtifactSite,
  type ArtifactSource,
  type ArtifactType,
  type CelestialBody,
  type VerificationStatus,
} from './format';
import { computeCombinedSilence } from './silence';

export {
  ARTIFACT_TYPE_LABELS,
  formatCoordinates,
  type Artifact,
  type ArtifactImage,
  type ArtifactLegacyItem,
  type ArtifactSite,
  type ArtifactSource,
  type ArtifactType,
  type CelestialBody,
  type VerificationStatus,
};

export interface ArchiveSnapshot {
  totalCount: number;
  marsCount: number;
  moonCount: number;
  verifiedCount: number;
  pendingCount: number;
  minYear: number;
  maxYear: number;
  mostRecentContact: {
    id: string;
    name: string;
    lastContactDate: string;
  } | null;
  combinedSilenceMono: string;
  combinedSilenceAccessible: string;
}

async function normalizeArtifact(
  entry: Awaited<ReturnType<typeof getCollection<'artifacts'>>>[number],
): Promise<Artifact> {
  const data = entry.data;
  let resolvedImage: ArtifactImage | undefined;

  if (data.image) {
    const optimized = await getImage({ src: data.image.file });
    resolvedImage = {
      src: optimized.src,
      width: data.image.file.width,
      height: data.image.file.height,
      metadata: data.image.file,
      alt: data.image.alt,
      credit: data.image.credit,
      originalUrl: data.image.originalUrl,
    };
  }

  return {
    id: data.id,
    name: data.name,
    nssdcId: data.nssdcId,
    agency: data.agency,
    body: data.body,
    type: data.type,
    launchDate: data.launchDate,
    lastContactDate: data.lastContactDate,
    site: data.site,
    endCause: data.endCause,
    scientificValue: data.scientificValue,
    kidSummary: data.kidSummary,
    sizeFact: data.sizeFact,
    legacy: data.legacy,
    verification: data.verification,
    verificationNote: data.verificationNote,
    sources: data.sources,
    image: resolvedImage,
    featured: data.featured,
  };
}

/**
 * Single data-access seam for the artifact archive.
 * Today reads from Astro's static content collection; later can swap to an API client here.
 */
export async function getArtifacts(): Promise<Artifact[]> {
  const entries = await getCollection('artifacts');
  const normalized = await Promise.all(entries.map((entry) => normalizeArtifact(entry)));

  return normalized.sort((a, b) => {
    if (a.featured !== b.featured) {
      return a.featured ? -1 : 1;
    }
    return b.lastContactDate.localeCompare(a.lastContactDate);
  });
}

export async function getArtifact(id: string): Promise<Artifact | undefined> {
  const entry = await getEntry('artifacts', id);
  if (!entry) return undefined;
  return normalizeArtifact(entry);
}

export async function getArchiveSnapshot(artifacts?: Artifact[]): Promise<ArchiveSnapshot> {
  const items = artifacts ?? (await getArtifacts());
  const nowMs = Date.parse(SITE.baseDate);
  const currentYear = new Date(nowMs).getUTCFullYear();

  const marsCount = items.filter((item) => item.body === 'mars').length;
  const moonCount = items.filter((item) => item.body === 'moon').length;
  const verifiedCount = items.filter((item) => item.verification === 'verified').length;
  const pendingCount = items.length - verifiedCount;

  const launchYears = items.map((item) => Number.parseInt(item.launchDate.slice(0, 4), 10));
  const minYear = launchYears.length > 0 ? Math.min(...launchYears) : 1967;

  const sortedByContact = [...items].sort((a, b) =>
    b.lastContactDate.localeCompare(a.lastContactDate),
  );
  const latest = sortedByContact[0] ?? null;

  const combined = computeCombinedSilence(
    items.map((item) => item.lastContactDate),
    nowMs,
  );

  return {
    totalCount: items.length,
    marsCount,
    moonCount,
    verifiedCount,
    pendingCount,
    minYear,
    maxYear: currentYear,
    mostRecentContact: latest
      ? {
          id: latest.id,
          name: latest.name,
          lastContactDate: latest.lastContactDate,
        }
      : null,
    combinedSilenceMono: combined.formattedMono,
    combinedSilenceAccessible: combined.formattedAccessible,
  };
}
