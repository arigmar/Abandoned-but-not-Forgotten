import type { Artifact } from '../format';
import type { ReadingMode } from '../discovery';

export type ExpeditionArtifact = Omit<Artifact, 'image'>;

export type ExpeditionPhase = 'transit' | 'descent' | 'drive' | 'inspect' | 'complete' | 'ascent';

export interface HotspotTelemetry {
  subsystemTag: string;
  nominalMetric: string;
  nominalValue: string;
  finalMetric: string;
  finalValue: string;
  waveform: 'power' | 'scale' | 'seismic' | 'sensor' | 'relay';
  testLabel: string;
  testResult: string;
}

export interface HotspotData {
  id: string;
  key: number;
  label: string;
  eyebrow: string;
  title: string;
  explorerBody: string;
  technicalBody: string;
  telemetry: HotspotTelemetry;
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
  planetArtifacts?: ExpeditionArtifact[];
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
  stageEl: HTMLElement;
  webglFallbackEl: HTMLElement;
  standbyEl: HTMLElement;
  liveRegionEl: HTMLElement | null;
  initialMode: ReadingMode;
  initialPhase?: 'transit' | 'descent' | 'drive';
  reducedMotion: boolean;
  onExit: () => void;
  onSelectAnother: () => void;
  onCaptureOtherBody?: (body: 'mars' | 'moon') => void;
}

export interface ExpeditionController {
  setReadingMode: (mode: ReadingMode) => void;
  destroy: () => void;
}
