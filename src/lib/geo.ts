/**
 * Shared geography helpers. Server pages, client components and the map all
 * read from here so municipality framing never diverges.
 */

export type MunicipioCenter = { lat: number; lng: number };

/** Approximate centroids — good enough to frame a municipality locally. */
export const MUNICIPIO_CENTERS: Record<string, MunicipioCenter> = {
  // La Habana (15 municipios)
  "Habana Vieja": { lat: 23.14, lng: -82.36 },
  "Centro Habana": { lat: 23.145, lng: -82.378 },
  "Diez de Octubre": { lat: 23.098, lng: -82.383 },
  Cerro: { lat: 23.118, lng: -82.372 },
  "Plaza de la Revolución": { lat: 23.135, lng: -82.393 },
  Marianao: { lat: 23.128, lng: -82.437 },
  "La Lisa": { lat: 23.131, lng: -82.458 },
  Boyeros: { lat: 23.065, lng: -82.415 },
  Playa: { lat: 23.115, lng: -82.42 },
  "Arroyo Naranjo": { lat: 23.073, lng: -82.356 },
  "San Miguel del Padrón": { lat: 23.113, lng: -82.34 },
  Cotorro: { lat: 23.095, lng: -82.288 },
  Guanabacoa: { lat: 23.123, lng: -82.295 },
  Regla: { lat: 23.127, lng: -82.333 },
  "Habana del Este": { lat: 23.156, lng: -82.322 },
  // Sancti Spíritus
  "Sancti Spíritus": { lat: 21.933, lng: -79.444 },
  Trinidad: { lat: 21.802, lng: -79.983 },
  Cabaiguán: { lat: 21.992, lng: -79.398 },
  Jatibonico: { lat: 21.946, lng: -79.172 },
  Yaguajay: { lat: 22.327, lng: -79.192 },
};

export type Region = {
  bounds: [[number, number], [number, number]];
  minZoom: number;
  center: [number, number];
};

/** Per-province camera limits: users can only load tiles inside their region. */
export const REGIONS: Record<string, Region> = {
  "La Habana": {
    bounds: [
      [23.0, -82.48],
      [23.24, -82.28],
    ],
    minZoom: 11,
    center: [23.12, -82.38],
  },
  "Sancti Spíritus": {
    bounds: [
      [21.55, -80.1],
      [22.45, -79.05],
    ],
    minZoom: 9,
    center: [21.95, -79.45],
  },
};

const CUBA_FALLBACK: Region = {
  bounds: [
    [19.7, -85.3],
    [23.4, -73.9],
  ],
  minZoom: 8,
  center: [21.5, -79.5],
};

export function regionFor(provincia?: string | null): Region {
  if (provincia && REGIONS[provincia]) return REGIONS[provincia];
  return CUBA_FALLBACK;
}
