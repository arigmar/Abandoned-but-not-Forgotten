<h1 align="center">Scientific Monuments Archive</h1>

<p align="center">
  <b>Not space junk. Scientific monuments.</b><br>
  A museum archive of the inactive rovers, landers and surface stations NASA left on Mars and the Moon.
</p>

<p align="center">
  <img alt="NASA Space Apps" src="https://img.shields.io/badge/NASA-Space%20Apps%20Challenge-0B3D91?style=for-the-badge&logo=nasa&logoColor=white">
  <img alt="Astro" src="https://img.shields.io/badge/Astro-7-BC52EE?style=for-the-badge&logo=astro&logoColor=white">
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-3D-000000?style=for-the-badge&logo=threedotjs&logoColor=white">
  <img alt="TurboWarp" src="https://img.shields.io/badge/Game-TurboWarp-FF4C4C?style=for-the-badge&logo=scratch&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-Apache%202.0-blue?style=for-the-badge">
</p>

<p align="center">
  <a href="https://arigmar.github.io/Abandoned-but-not-Forgotten/"><b>Live Demo</b></a> ·
  <a href="#demo-video">Demo Video</a> ·
  <a href="#how-to-install">How to Install</a> ·
  <a href="#credits">Credits</a>
</p>

---

## About

Built by **ROCKY TEAM** for the **NASA Space Apps Challenge**: *Abandoned but not Forgotten*.

Since the 1960s, NASA has left hardware across the solar system. School-age space enthusiasts often hear only about active missions, while the machines that came before them remain silent.

**Scientific Monuments Archive** is a telemetry registry and museum archive of inactive rovers, landers and surface stations across Mars and the Moon, honoring their scientific legacy after final contact.

## Demo Video

<!-- Replace this line with the demo video (see "Adding the demo video" in the team notes) -->
*Coming soon.*

## Screenshots

<!-- Add screenshots to docs/screenshots/ and uncomment the lines below -->
[Home](docs/screenshots/home.png) 
[Surface Archive](docs/screenshots/archive.png)
[Flight to Mars](docs/screenshots/flight.png)
[Descent](docs/screenshots/landing.png)

## What's Inside

The site is a single page organized in six sections:

| # | Section | Status | Description |
|---|---|---|---|
| 01 | **Signal Detection** | Active | Opening section of the archive. |
| 02 | **Surface Expedition** | Active | 3D exterior reconnaissance of the cataloged spacecraft, built with Three.js. |
| 03 | **Field Simulator** | Active | *Postcards from Silence*, a TurboWarp game, plus the **Flight to Mars & Descent** mission (see below). |
| 04 | **Mission Context** | In progress | Guided visual sequence on how missions become monuments. |
| 05 | **Surface Archive** | Active | Dashboard with key figures, filters, a surface atlas, a timeline and a museum plaque for every spacecraft. |
| 06 | **Sources & Credits** | In progress | References for every record. |

### Cataloged Spacecraft

| Spacecraft | Location | Type | NSSDCA ID | Launch | Last contact | Data status |
|---|---|---|---|---|---|---|
| Surveyor 3 | Moon | Lander | 1967-035A | 1967-04-17 | 1967-05-04 | Verified |
| Apollo 11 EASEP | Moon | Instrument station | 1969-059C | 1969-07-16 | 1969-08-25 | Verified |
| Apollo 15 ALSEP | Moon | Instrument station | 1971-063C | 1971-07-26 | 1977-09-30 | Verified |
| Opportunity (MER-B) | Mars | Rover | 2003-032A | 2003-07-08 | 2018-06-10 | Verified |
| InSight | Mars | Lander | 2018-042A | 2018-05-05 | 2022-12-15 | Verified |
| Ingenuity (Mars Helicopter) | Mars | Helicopter | 2020-052A | 2020-07-30 | 2024-04-16 | Pending verification |

### Flight to Mars & Descent

A two-stage 3D mission built with Three.js.

**Stage 1: Transit.** Leave Earth, steer past the Moon and reach Mars.

| Action | Keys |
|---|---|
| Thrust | `W` / `Space` |
| Brake | `S` |
| Turn | `A` / `D` or `←` / `→` |
| Pitch | `↑` / `↓` |
| Restart | `R` |

**Stage 2: Descent.** A powered landing under Martian gravity (3.72 m/s²). Land slowly on the pad before running out of fuel.

| Action | Keys |
|---|---|
| Main engine | `Space` / `W` / `↑` |
| Move left / right | `A` / `D` or `←` / `→` |
| Restart | `R` |

## How to Install

**Requirements:** [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/) **22.23.4 or newer** (Astro will not start with an older version).

| Step | Command | What it does |
|---|---|---|
| 1. Clone the repository | `git clone https://github.com/arigmar/Abandoned-but-not-Forgotten.git` | Downloads the project |
| 2. Enter the web folder | `cd Abandoned-but-not-Forgotten/ABNF_WEB` | The site lives in the `ABNF_WEB` subfolder |
| 3. Check your Node version | `node -v` | Must print `v22.23.4` or higher |
| 4. Install dependencies | `npm install` | Installs Astro, Three.js and the rest |
| 5. Start the site | `npm run dev` | Opens a local server |
| 6. Open it | `http://localhost:4321` | View the site in your browser |

**Need a newer Node.js?** A version manager such as [fnm](https://github.com/Schniz/fnm) lets you install it without touching your system version:

```bash
fnm install 22
fnm use 22
```

### Other Commands

Run them from the `ABNF_WEB` folder:

| Command | What it does |
|---|---|
| `npm run dev` | Local development server at `http://localhost:4321` |
| `npm run check` | Astro and TypeScript diagnostics |
| `npm run build` | Static build to `./dist/` |
| `npm run preview` | Preview the build locally |

### Deploying

The site is a static build. For a subpath deploy such as GitHub Pages, set these environment variables before `npm run build`:

| Variable | Example |
|---|---|
| `SITE_URL` | `https://arigmar.github.io` |
| `BASE_PATH` | `/Abandoned-but-not-Forgotten` |

## Tech Stack

- [Astro 7](https://astro.build/): site framework (static output)
- [Tailwind CSS 4](https://tailwindcss.com/): styling
- [Three.js](https://threejs.org/): Surface Expedition and the Flight to Mars & Descent mission
- [TypeScript](https://www.typescriptlang.org/)
- [TurboWarp](https://turbowarp.org/): *Postcards from Silence*, built with block-based programming and compiled to HTML5 with the [TurboWarp Packager](https://packager.turbowarp.org/)
- [Fontsource](https://fontsource.org/): self-hosted fonts (Hanken Grotesk, Instrument Serif, JetBrains Mono)

## Credits

### Mission Data

Every spacecraft record cites official NASA sources:

| Spacecraft | Sources |
|---|---|
| Surveyor 3 | [NSSDCA 1967-035A](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1967-035A) · [NASA Science](https://science.nasa.gov/mission/surveyor-3/) |
| Apollo 11 EASEP | [NSSDCA 1969-059C](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-059C) · [NASA Science](https://science.nasa.gov/mission/apollo-11/) |
| Apollo 15 ALSEP | [NSSDCA 1971-063C](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1971-063C) · [NASA Science](https://science.nasa.gov/mission/apollo-15/) |
| Opportunity (MER-B) | [NSSDCA 2003-032A](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2003-032A) · [NASA Science](https://science.nasa.gov/mission/mer-opportunity/) |
| InSight | [NSSDCA 2018-042A](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2018-042A) · [NASA Science](https://science.nasa.gov/mission/insight/) |
| Ingenuity | [NSSDCA 2020-052A](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2020-052A) · [NASA Science](https://science.nasa.gov/mission/mars-2020-perseverance/ingenuity-mars-helicopter/) |

### 3D Models

All models are from [Sketchfab](https://sketchfab.com/) under the [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) license.

| File | Model | Author | Used in |
|---|---|---|---|
| `earth.glb` | [Earth \| Terra - Downloadable model](https://sketchfab.com/3d-models/earth-terra-downloadable-model-30fd7e9c4e6946ddb6fcae7a97b2b0d4) | [murilo.kleine](https://sketchfab.com/murilo.kleine) | Flight, Descent |
| `Lune.glb` | [LUNE](https://sketchfab.com/3d-models/lune-ecf0a02b8151418689e78abec4f94b96) | [Stéphane Agullo](https://sketchfab.com/sa3d) | Flight |
| `mars.glb` | [Mars](https://sketchfab.com/3d-models/mars-5fc8b7168b044527a05ed3903c998b65) | [AirStudios](https://sketchfab.com/sebbe613) | Flight |
| `perseverance_rover_on_mars.glb` | [Perseverance rover on Mars](https://sketchfab.com/3d-models/perseverance-rover-on-mars-fc11b1c7457b4d07ad7a0825911e2847) | [Ignazio Pillitteri](https://sketchfab.com/gnaz) | Descent |
| `spaceship.glb` | [SpaceShip](https://sketchfab.com/3d-models/spaceship-6164a883f57f4f13938c3c5999bc0e1f) | [JazOone](https://sketchfab.com/JazOone) | Flight, Descent |
| *sun.glb* | [Sun](https://sketchfab.com/3d-models/sun-9ef1c68fbb944147bcfcc891d3912645) | [SebastianSosnowski](https://sketchfab.com/SebastianSosnowski) | *Flight* |

## License

The source code is released under the [Apache License 2.0](LICENSE). Third-party assets (3D models, libraries and NASA data) remain under their own licenses, listed above.

---

<p align="center">Made by <b>ROCKY TEAM</b> for the NASA Space Apps Challenge</p>
