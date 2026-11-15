import type { TokenPalette } from '../palette';
import { buildApollo11EasepMonument } from './apollo-11-easep';
import { buildApollo15AlsepMonument } from './apollo-15-alsep';
import { buildIngenuityMonument } from './ingenuity';
import { buildInsightMonument } from './insight';
import { buildOpportunityMonument } from './opportunity';
import { buildSurveyor3Monument } from './surveyor-3';
import type { MonumentBuild } from './types';

export type { MonumentBuild } from './types';

export function buildMonumentExterior(artifactId: string, tokens: TokenPalette): MonumentBuild {
  switch (artifactId) {
    case 'opportunity':
      return buildOpportunityMonument(tokens);
    case 'insight':
      return buildInsightMonument(tokens);
    case 'ingenuity':
      return buildIngenuityMonument(tokens);
    case 'surveyor-3':
      return buildSurveyor3Monument(tokens);
    case 'apollo-11-easep':
      return buildApollo11EasepMonument(tokens);
    case 'apollo-15-alsep':
      return buildApollo15AlsepMonument(tokens);
    default:
      return buildOpportunityMonument(tokens);
  }
}
