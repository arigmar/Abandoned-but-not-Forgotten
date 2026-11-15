/**
 * Base-path helpers for static subpath deploys (e.g. GitHub Pages).
 *
 * `import.meta.env.BASE_URL` is inlined by Vite at build time, both in Astro
 * frontmatter and in client-side scripts, so the same code works with
 * `BASE_PATH=/` and `BASE_PATH=/abnf-web`.
 */

const rawBase = import.meta.env.BASE_URL || '/';

/** Base URL without trailing slash. Empty string for root deploys. */
export const BASE = rawBase.replace(/\/+$/, '');

/**
 * Prefix a root-relative path with the deploy base.
 * Accepts paths with or without leading slash and preserves hashes.
 *
 * @example withBase('/assets/games/mars.glb') // '/abnf-web/assets/games/mars.glb'
 * @example withBase('/#flight')               // '/abnf-web/#flight'
 */
export function withBase(path: string): string {
  return `${BASE}/${path.replace(/^\/+/, '')}`;
}
