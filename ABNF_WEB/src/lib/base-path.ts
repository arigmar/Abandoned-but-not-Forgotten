/**
 * Base-path helpers for static subpath deploys (e.g. GitHub Pages).
 *
 * `import.meta.env.BASE_URL` is inlined by Vite at build time, both in Astro
 * frontmatter and in client-side scripts, so the same code works with
 * `BASE_PATH=/` and `BASE_PATH=/abnf-web`.
 */

const DEFAULT_ASSETS_BASE_URL = 'https://abnf-storage.fngl-dev.me';

const rawBase = import.meta.env.BASE_URL || '/';
const rawAssetsBase = import.meta.env.PUBLIC_ASSETS_URL ?? DEFAULT_ASSETS_BASE_URL;

/** Base URL without trailing slash. Empty string for root deploys. */
export const BASE = rawBase.replace(/\/+$/, '');

/** External asset CDN/storage base URL without trailing slash. */
export const ASSETS_BASE = rawAssetsBase.replace(/\/+$/, '');

const ABSOLUTE_URL_RE = /^https?:\/\//i;

/**
 * Prefix a root-relative path with the deploy base.
 * Accepts paths with or without leading slash, preserves hashes, and leaves
 * absolute `http(s)://` URLs untouched.
 *
 * @example withBase('/#flight') // '/abnf-web/#flight'
 */
export function withBase(path: string): string {
  if (ABSOLUTE_URL_RE.test(path)) return path;
  return `${BASE}/${path.replace(/^\/+/, '')}`;
}

/**
 * Resolve a large static asset path (`.glb`, `.mp4`, etc.) against the external
 * storage origin (`PUBLIC_ASSETS_URL` or `https://abnf-storage.fngl-dev.me`).
 * Falls back to `withBase` if `PUBLIC_ASSETS_URL` is explicitly cleared.
 *
 * @example withAssetUrl('/assets/games/mars.glb') // 'https://abnf-storage.fngl-dev.me/assets/games/mars.glb'
 */
export function withAssetUrl(path: string): string {
  if (ABSOLUTE_URL_RE.test(path)) return path;
  const normalized = path.replace(/^\/+/, '');
  return ASSETS_BASE ? `${ASSETS_BASE}/${normalized}` : withBase(path);
}
