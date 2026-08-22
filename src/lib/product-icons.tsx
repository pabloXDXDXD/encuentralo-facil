"use client";

import {
  Baby,
  BatteryCharging,
  BeerStein,
  Bread,
  Broom,
  CookingPot,
  Cookie,
  Cheese,
  CoffeeBean,
  Drop,
  Egg,
  Fish,
  Flame,
  ForkKnife,
  Grains,
  HandSoap,
  Jar,
  Lightbulb,
  MapPin,
  Martini,
  Package,
  Sparkle,
  SprayBottle,
  ToiletPaper,
  Wine,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

/**
 * Canonical catalog slugs -> Phosphor icons. Every name verified against the
 * installed package (no invented exports). Unknown/future products fall back.
 */
const PRODUCT_ICONS: Record<string, Icon> = {
  // Proteína
  pollo: CookingPot,
  cerdo: ForkKnife,
  picadillo: CookingPot,
  salchichas: ForkKnife,
  pescado: Fish,
  // Granos y cereales
  arroz: Grains,
  "frijoles-negros": Grains,
  chicharos: Grains,
  garbanzos: Grains,
  lentejas: Grains,
  "harina-trigo": Jar,
  "harina-maiz": Jar,
  pasta: ForkKnife,
  pan: Bread,
  galletas: Cookie,
  // Aceites y condimentos
  aceite: Drop,
  sal: Jar,
  azucar: Jar,
  cafe: CoffeeBean,
  vinagre: Wine,
  consome: CookingPot,
  // Lácteos y huevos
  "leche-polvo": Jar,
  huevos: Egg,
  queso: Cheese,
  yogurt: Jar,
  // Limpieza
  detergente: Package,
  "jabon-lavar": Broom,
  lejia: SprayBottle,
  "papel-sanitario": ToiletPaper,
  panales: Baby,
  // Higiene personal
  "jabon-bano": HandSoap,
  champu: Drop,
  "pasta-dental": Sparkle,
  // Bebidas
  agua: Drop,
  refresco: Martini,
  malta: BeerStein,
  cerveza: BeerStein,
  ron: Wine,
  // Otros
  baterias: BatteryCharging,
  "gas-balon": Flame,
  bombillos: Lightbulb,
  velas: Flame,
};

// Fallback icon for unknown slugs: Package (imported above).

export function ProductIcon({
  slug,
  size = 24,
  className,
}: {
  slug: string;
  size?: number;
  className?: string;
}) {
  const Icon = PRODUCT_ICONS[slug] ?? Package;
  return <Icon size={size} className={className} aria-hidden />;
}

/** Accent map pin for server pages (client-boundary wrapper). */
export function MapPinAccent({ size = 22 }: { size?: number }) {
  return <MapPin size={size} weight="fill" className="text-accent" aria-hidden />;
}
