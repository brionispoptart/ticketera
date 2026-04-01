type Rgb = readonly [number, number, number];

export type UserColorToken = "dynamic";

export type UserColorProfile = {
  token: UserColorToken;
  label: string;
  rgb: Rgb;
  dotColor: string;
  badgeBorderColor: string;
  badgeBackgroundColor: string;
  badgeTextColor: string;
};

function normalizeSeed(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hashSeed(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  // MurmurHash3-style avalanche finalizer — ensures even similar
  // inputs (e.g. "Brion Lund" vs "Brian Lund") scatter across the
  // full 32-bit range instead of clustering.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const normalizedHue = hue / 360;
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;

  if (normalizedSaturation === 0) {
    const channel = Math.round(normalizedLightness * 255);
    return [channel, channel, channel];
  }

  const hueToChannel = (p: number, q: number, offset: number) => {
    let temp = offset;
    if (temp < 0) {
      temp += 1;
    }
    if (temp > 1) {
      temp -= 1;
    }
    if (temp < 1 / 6) {
      return p + (q - p) * 6 * temp;
    }
    if (temp < 1 / 2) {
      return q;
    }
    if (temp < 2 / 3) {
      return p + (q - p) * (2 / 3 - temp) * 6;
    }
    return p;
  };

  const q = normalizedLightness < 0.5
    ? normalizedLightness * (1 + normalizedSaturation)
    : normalizedLightness + normalizedSaturation - normalizedLightness * normalizedSaturation;
  const p = 2 * normalizedLightness - q;

  return [
    Math.round(hueToChannel(p, q, normalizedHue + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, normalizedHue) * 255),
    Math.round(hueToChannel(p, q, normalizedHue - 1 / 3) * 255),
  ];
}

function seedToHsl(seed: string) {
  const h1 = hashSeed(seed || "ticketera-user");
  // derive independent hashes for each channel
  const h2 = hashSeed(seed + "\x01");
  const h3 = hashSeed(seed + "\x02");

  const hue = h1 % 360;
  const saturation = 50 + (h2 % 40);
  const lightness = 40 + (h3 % 25);

  return { hue, saturation, lightness };
}

function toHsl(value: { hue: number; saturation: number; lightness: number }) {
  return `hsl(${value.hue} ${value.saturation}% ${value.lightness}%)`;
}

function toHsla(value: { hue: number; saturation: number; lightness: number }, alpha: number) {
  return `hsl(${value.hue} ${value.saturation}% ${value.lightness}% / ${alpha})`;
}

export function getUserColor(seed: string): UserColorProfile {
  const normalizedSeed = normalizeSeed(seed);
  const hsl = seedToHsl(normalizedSeed);
  const dotHsl = { ...hsl, lightness: Math.min(72, hsl.lightness + 10) };
  const textHsl = { ...hsl, lightness: 90 };
  const seededRgb = hslToRgb(hsl.hue, hsl.saturation, hsl.lightness);

  return {
    token: "dynamic",
    label: `H${hsl.hue}`,
    rgb: seededRgb,
    dotColor: toHsl(dotHsl),
    badgeBorderColor: toHsla(hsl, 0.42),
    badgeBackgroundColor: toHsla(hsl, 0.18),
    badgeTextColor: toHsl(textHsl),
  };
}
