import { defineConfig } from 'astro/config';

import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

// Configure `site` and `base` via environment variables (or directly here)
// for root deploys (Netlify/Vercel) or subpath deploys (GitHub Pages).
export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL || undefined,
  base: process.env.BASE_PATH || '/',
  integrations: [preact()],

  vite: {
    plugins: [tailwindcss()],
  },
});
