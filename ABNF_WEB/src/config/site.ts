export type AspectRatioOption = '16:9' | '4:3';

export interface SiteSection {
  id: string;
  code: string;
  label: string;
  title: string;
  status: 'active' | 'pending';
}

export const SITE = {
  // Alternates: 'AFTERGLOW' | 'SILENT HORIZON' | 'TELEMETRY ZERO' | 'MONUMENTS OF DUST'
  name: 'ROCKY TEAM',

  // Alternates:
  // - 'Silent machines. Enduring planetary science.'
  // - 'Dormant on Mars and Moon.'
  // - 'Where telemetry ends, memory begins.'
  tagline: 'Not space junk. Scientific monuments.',

  premise:
    'A telemetry registry and museum archive of inactive rovers, landers, and surface stations across Mars and the Moon—honoring their scientific legacy after final contact.',

  // Single switchable aspect ratio constant for the embedded Field Simulator ('16:9' | '4:3')
  gameAspectRatio: '16:9' as AspectRatioOption,

  // Fullscreen intro video shown on first visit (resolved via withAssetUrl against external storage)
  introVideoPath: '/assets/intro.mp4',

  // Reference build epoch in UTC ISO-8601
  baseDate: '2026-11-14T00:00:00Z',

  sections: [
    {
      id: 'signal',
      code: '01',
      label: 'SIGNAL',
      title: 'Signal Detection',
      status: 'active',
    },
    {
      id: 'expedition',
      code: '02',
      label: 'EXPEDITION',
      title: 'Surface Expedition',
      status: 'active',
    },
    {
      id: 'simulator',
      code: '03',
      label: 'SIMULATOR',
      title: 'Field Simulator',
      status: 'pending',
    },
    {
      id: 'story',
      code: '04',
      label: 'STORY',
      title: 'Mission Context',
      status: 'pending',
    },
    {
      id: 'archive',
      code: '05',
      label: 'ARCHIVE',
      title: 'Surface Archive',
      status: 'active',
    },
    {
      id: 'sources',
      code: '06',
      label: 'SOURCES',
      title: 'Sources & Credits',
      status: 'pending',
    },
  ] satisfies SiteSection[],
} as const;
