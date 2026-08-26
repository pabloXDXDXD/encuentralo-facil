import { describe, expect, it } from "vitest";
import { selectBestPrice } from "@/lib/best-price";

describe("selectBestPrice — chip de mejor precio", () => {
  it("elige el precio mínimo entre las filas visibles", () => {
    const out = selectBestPrice([
      { price_from: 500, distance_m: 100 },
      { price_from: 450, distance_m: 300 },
      { price_from: 480, distance_m: 200 },
    ]);
    expect(out).toEqual({ price: 450, distanceM: 300 });
  });

  it("ignora las filas sin precio (price_from null)", () => {
    const out = selectBestPrice([
      { price_from: null, distance_m: 50 },
      { price_from: 600, distance_m: 400 },
      { price_from: null, distance_m: 10 },
    ]);
    expect(out).toEqual({ price: 600, distanceM: 400 });
  });

  it("devuelve null con entrada vacía", () => {
    expect(selectBestPrice([])).toBeNull();
  });

  it("devuelve null si ninguna fila tiene precio", () => {
    const out = selectBestPrice([
      { price_from: null, distance_m: 50 },
      { price_from: null, distance_m: 80 },
    ]);
    expect(out).toBeNull();
  });

  it("en empate de precio gana la fila más cercana", () => {
    const out = selectBestPrice([
      { price_from: 450, distance_m: 900 },
      { price_from: 450, distance_m: 250 },
      { price_from: 450, distance_m: 600 },
    ]);
    expect(out).toEqual({ price: 450, distanceM: 250 });
  });

  it("la distancia sale de la propia fila ganadora", () => {
    const out = selectBestPrice([
      { price_from: 700, distance_m: 120 },
      { price_from: 300, distance_m: 1234 },
    ]);
    expect(out?.price).toBe(300);
    expect(out?.distanceM).toBe(1234);
  });

  it("una sola fila con precio se devuelve tal cual", () => {
    const out = selectBestPrice([{ price_from: 250, distance_m: 75 }]);
    expect(out).toEqual({ price: 250, distanceM: 75 });
  });
});
