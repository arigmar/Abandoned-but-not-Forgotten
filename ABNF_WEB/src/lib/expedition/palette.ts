import { Color } from 'three';

export interface TokenPalette {
  voidBg: Color;
  slate: Color;
  slateRaised: Color;
  dormant: Color;
  turquoise: Color;
  amber: Color;
  alert: Color;
  textPrimary: Color;
  metalLight: Color;
  metalMid: Color;
  metalDark: Color;
  solarCell: Color;
  goldFoil: Color;
  copper: Color;
  roverChassis: Color;
  roverDeck: Color;
  roverWheel: Color;
  starPrimary: Color;
  starSecondary: Color;
}

export interface BodyEnvironmentPalette {
  skyColor: Color;
  horizonColor: Color;
  fogColor: Color;
  fogDensity: number;
  terrainLow: Color;
  terrainHigh: Color;
  rockColor: Color;
  dustColor: Color;
  sunColor: Color;
  sunIntensity: number;
  ambientColor: Color;
  ambientIntensity: number;
  hemiGroundColor: Color;
  planetDark: Color;
  planetLight: Color;
  plumeColor: Color;
}

function clampColorToCeiling(color: Color, maxChannel = 0.88): Color {
  if (color.r > maxChannel || color.g > maxChannel || color.b > maxChannel) {
    const scale = maxChannel / Math.max(color.r, color.g, color.b);
    color.multiplyScalar(scale);
  }
  return color;
}

function readCssTokenColor(
  styles: CSSStyleDeclaration | null,
  varName: string,
  fallbackHex: string,
): Color {
  const raw = styles?.getPropertyValue(varName).trim();
  const c = new Color();
  try {
    c.set(raw && raw.length > 0 ? raw : fallbackHex);
  } catch {
    c.set(fallbackHex);
  }
  return clampColorToCeiling(c, 0.9);
}

export function createTokenPalette(): TokenPalette {
  const styles =
    typeof window !== 'undefined' && typeof document !== 'undefined'
      ? window.getComputedStyle(document.documentElement)
      : null;

  return {
    voidBg: readCssTokenColor(styles, '--color-void', '#090D16'),
    slate: readCssTokenColor(styles, '--color-slate', '#131B2E'),
    slateRaised: readCssTokenColor(styles, '--color-slate-raised', '#182238'),
    dormant: readCssTokenColor(styles, '--color-dormant', '#7A89A6'),
    turquoise: readCssTokenColor(styles, '--color-turquoise', '#2EC4B6'),
    amber: readCssTokenColor(styles, '--color-amber', '#FF9F1C'),
    alert: readCssTokenColor(styles, '--color-alert', '#E71D36'),
    textPrimary: readCssTokenColor(styles, '--color-text-primary', '#E6ECF5'),
    // Material shades clamped well below --color-text-primary (zero pure light clipping)
    metalLight: new Color('#B8C4D8'),
    metalMid: new Color('#6D7C94'),
    metalDark: new Color('#263044'),
    solarCell: new Color('#192B4A'),
    goldFoil: new Color('#B58F4B'),
    copper: new Color('#B56D45'),
    roverChassis: new Color('#65758D'),
    roverDeck: new Color('#364357'),
    roverWheel: new Color('#1D2432'),
    starPrimary: new Color('#CBD6EA'),
    starSecondary: new Color('#7D91B3'),
  };
}

export function getBodyEnvironmentPalette(
  body: 'mars' | 'moon',
  tokens: TokenPalette,
): BodyEnvironmentPalette {
  if (body === 'mars') {
    return {
      // Muted dusty rose-slate sky and rust-basalt regolith, distinct from amber (#FF9F1C)
      skyColor: new Color('#26191B'),
      horizonColor: new Color('#472E2A'),
      fogColor: new Color('#392522'),
      fogDensity: 0.0085,
      terrainLow: new Color('#4C2E27'),
      terrainHigh: new Color('#784A3C'),
      rockColor: new Color('#3B2825'),
      dustColor: new Color('#916354'),
      sunColor: new Color('#DFCFC0'),
      sunIntensity: 0.85,
      ambientColor: new Color('#634743'),
      ambientIntensity: 0.52,
      hemiGroundColor: new Color('#4E312B'),
      planetDark: new Color('#4E2F28'),
      planetLight: new Color('#9C5D49'),
      plumeColor: new Color('#D17D3E'),
    };
  }

  return {
    // Airless black sky matching --color-void and cool gray lunar regolith
    skyColor: tokens.voidBg.clone(),
    horizonColor: new Color('#141C2B'),
    fogColor: tokens.voidBg.clone(),
    fogDensity: 0.0032,
    terrainLow: new Color('#333C4E'),
    terrainHigh: new Color('#66738A'),
    rockColor: new Color('#434E63'),
    dustColor: tokens.dormant.clone(),
    sunColor: new Color('#D4DDEC'),
    sunIntensity: 0.88,
    ambientColor: new Color('#2D384D'),
    ambientIntensity: 0.36,
    hemiGroundColor: new Color('#293142'),
    planetDark: new Color('#353F52'),
    planetLight: new Color('#8592A8'),
    plumeColor: tokens.turquoise.clone(),
  };
}
