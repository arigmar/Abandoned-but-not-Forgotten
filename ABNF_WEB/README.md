# AFTERGLOW — Scientific Monuments Archive

**Tagline:** *"Not space junk. Scientific monuments."*  
**NASA Space Apps Challenge** front-end telemetry registry and museum plaque archive for inactive rovers, landers, and surface instruments on **Mars and the Moon**.

---

## Quick Start

```sh
npm install
npm run dev      # Local development server at http://localhost:4321
npm run check    # Run Astro + TypeScript diagnostics (astro check)
npm run build    # Static build to ./dist/
npm run preview  # Preview ./dist/ locally
```

---

## Project Structure

```text
src/
  assets/artifacts/    # Technical monochrome schematics resolved via astro:assets
  components/          # Navbar, Hero, KpiStrip, Filters, SurfaceAtlas, TimeScrubber,
                       # Lifeline, ArtifactCard, PlaqueDialog, HoldToLink, PendingSection, GameFrame
  config/site.ts       # Site name, tagline, premise, game aspect ratio, section anchors
  content.config.ts    # Astro 7 Content Layer Zod schema for artifacts
  content/artifacts/   # Static JSON records (one file per spacecraft)
  lib/archive.ts       # Single data-access seam (getArtifacts, getArtifact, getArchiveSnapshot)
  lib/silence.ts       # UTC silence math + shared tab-aware setInterval ticker
  lib/archive-controller.ts
  pages/index.astro    # Single-page architecture (#signal -> #story -> #archive -> #simulator -> #sources)
  styles/tokens.css    # 60-30-10 color tokens & self-hosted Fontsource stacks
  styles/global.css
public/
  game/                # Drop compiled TurboWarp single-HTML file here as index.html
docs/
  DECISIONS.md         # Engineering and editorial log
  SOURCES.md           # Sourced NASA / NSSDCA / JPL references
  GAME-CONTRACT.md     # Scratch / TurboWarp packaging contract
```

---

## Adding a New Artifact

1. Add a schematic or verified NASA image in `src/assets/artifacts/`.
2. Create a JSON file in `src/content/artifacts/<id>.json` matching the Zod schema in [src/content.config.ts](src/content.config.ts).
   - Every fact and `legacy` item must cite an official NASA / NSSDCA / PDS URL in `sources[]`.
   - If any coordinate or telemetry value cannot be verified against an official source, set `"verification": "pending"` and document why in `"verificationNote"`.
3. Log the source URLs and access date in `docs/SOURCES.md`.
4. Run `npm run check && npm run build` to validate the schema and rebuild `./dist/`.

---

## Dropping In the Scratch / TurboWarp Game

1. Export the game from TurboWarp Packager as a single HTML file following `docs/GAME-CONTRACT.md`.
2. Save the output file as:
   `public/game/index.html`
3. Rebuild (`npm run build`). `src/components/GameFrame.astro` automatically switches `#simulator` from the standby calibration view to the live `<iframe>` while preserving `BASE_PATH`.

---

## Deploying Static Output

The build generates pure static HTML/CSS/JS in `./dist/` (suitable for GitHub Pages, Netlify, Vercel, or Cloudflare Pages).

- **Root deploy (Netlify / Vercel):**
  ```sh
  npm run build
  ```
- **Subpath deploy (GitHub Pages e.g. `https://org.github.io/abnf-web/`):**
  ```sh
  SITE_URL="https://org.github.io" BASE_PATH="/abnf-web" npm run build
  ```
