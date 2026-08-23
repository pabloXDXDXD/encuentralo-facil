import { describe, expect, it } from "vitest";
import { MUNICIPIO_CENTERS, REGIONS, regionFor } from "@/lib/geo";

describe("regionFor", () => {
  it("returns Havana region for La Habana", () => {
    const r = regionFor("La Habana");
    expect(r.minZoom).toBe(11);
    expect(r.center.length).toBe(2);
  });

  it("returns Sancti Spíritus region", () => {
    expect(regionFor("Sancti Spíritus").minZoom).toBeLessThan(11);
  });

  it("falls back to Cuba-wide for unknown provinces", () => {
    const r = regionFor("Atlántida");
    expect(r.minZoom).toBeLessThanOrEqual(9);
    // covers the whole island roughly
    expect(r.bounds[1][0]).toBeGreaterThan(23); // north edge above Havana lat
  });
});

describe("MUNICIPIO_CENTERS", () => {
  it("has centers inside their province regions", () => {
    const havana = REGIONS["La Habana"].bounds;
    for (const name of ["VedadoPlaceholder" in MUNICIPIO_CENTERS ? "VedadoPlaceholder" : "Playa"]) {
      const c = MUNICIPIO_CENTERS[name];
      expect(Number(c.lat)).toBeGreaterThan(havana[0][0] - 1);
      expect(Number(c.lat)).toBeLessThan(havana[1][0] + 1);
    }
  });

  it("includes Sancti Spíritus municipalities", () => {
    for (const name of ["Sancti Spíritus", "Trinidad", "Cabaiguán"]) {
      expect(MUNICIPIO_CENTERS[name]).toBeDefined();
    }
  });
});
