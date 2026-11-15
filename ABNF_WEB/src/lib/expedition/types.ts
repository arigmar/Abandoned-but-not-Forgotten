import type { Artifact } from '../format';
import type { ReadingMode } from '../discovery';

export type ExpeditionArtifact = Omit<Artifact, 'image'>;

export type ExpeditionPhase = 'transit' | 'descent' | 'drive' | 'inspect' | 'complete';

export interface HotspotData {
  id: string;
  key: number;
  label: string;
  eyebrow: string;
  title: string;
  explorerBody: string;
  technicalBody: string;
  sourceTitle?: string;
  sourceUrl?: string;
}

export interface ProjectedHotspot {
  data: HotspotData;
  x: number;
  y: number;
  visible: boolean;
  scanned: boolean;
  active: boolean;
}

export interface ExpeditionLaunchOptions {
  artifact: ExpeditionArtifact;
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
  stageEl: HTMLElement;
  webglFallbackEl: HTMLElement;
  standbyEl: HTMLElement;
  liveRegionEl: HTMLElement | null;
  initialMode: ReadingMode;
  reducedMotion: boolean;
  onExit: () => void;
  onSelectAnother: () => void;
}

export interface ExpeditionController {
  setReadingMode: (mode: ReadingMode) => void;
  destroy: () => void;
}
