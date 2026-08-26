import { describe, expect, it } from "vitest";
import { parseReportIntake } from "@/lib/repo";

const PLACE = "105192db-1111-4222-8333-444455556666";
const PIN = { lat: 21.943, lng: -79.449 };
const BASE = { productId: "11111111-2222-4333-8444-555566667777", availability: "available" };

describe("parseReportIntake — ubicacion XOR", () => {
  it("acepta un lugar existente sin pin", () => {
    const out = parseReportIntake({ ...BASE, placeId: PLACE });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.placeId).toBe(PLACE);
      expect(out.value.lat).toBeNull();
      expect(out.value.lng).toBeNull();
    }
  });

  it("acepta pin completo sin lugar", () => {
    const out = parseReportIntake({ ...BASE, ...PIN });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.placeId).toBeNull();
      expect(out.value.lat).toBe(21.943);
      expect(out.value.lng).toBe(-79.449);
    }
  });

  it("rechaza lugar Y pin juntos (XOR)", () => {
    const out = parseReportIntake({ ...BASE, placeId: PLACE, ...PIN });
    expect(out).toEqual({ ok: false, error: "invalid_input" });
  });

  it("rechaza cuando falta toda ubicacion", () => {
    const out = parseReportIntake({ ...BASE });
    expect(out).toEqual({ ok: false, error: "invalid_input" });
  });

  it("rechaza pin incompleto (solo lat)", () => {
    const out = parseReportIntake({ ...BASE, lat: 21.9 });
    expect(out).toEqual({ ok: false, error: "invalid_input" });
  });

  it("rechaza placeId con formato invalido y sin coords", () => {
    const out = parseReportIntake({ ...BASE, placeId: "no-es-uuid" });
    expect(out).toEqual({ ok: false, error: "invalid_input" });
  });

  it("rechaza coords no numericas sin lugar", () => {
    const out = parseReportIntake({ ...BASE, lat: "abc", lng: -79.449 });
    expect(out).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("parseReportIntake — alias legado storeId (D6)", () => {
  it("alia storeId a placeId cuando placeId no viene", () => {
    const out = parseReportIntake({ ...BASE, storeId: PLACE });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.placeId).toBe(PLACE);
  });

  it("placeId explicito gana sobre storeId", () => {
    const other = "99999999-8888-4777-8666-555544443333";
    const out = parseReportIntake({ ...BASE, storeId: PLACE, placeId: other });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.placeId).toBe(other);
  });

  it("payload legado minimo (storeId+producto+availability) pasa", () => {
    const out = parseReportIntake({
      storeId: PLACE,
      productId: BASE.productId,
      availability: "out_of_stock",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.availability).toBe("out_of_stock");
      expect(out.value.priceCup).toBeNull();
      expect(out.value.queueLevel).toBeNull();
    }
  });
});

describe("parseReportIntake — normalizacion de campos", () => {
  it("recorta label y descarta vacia", () => {
    const out = parseReportIntake({ ...BASE, ...PIN, label: "  La Trocha  " });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.label).toBe("La Trocha");

    const empty = parseReportIntake({ ...BASE, ...PIN, label: "   " });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.value.label).toBeNull();
  });

  it("redondea coords a 6 decimales", () => {
    const out = parseReportIntake({ ...BASE, lat: 21.123456789, lng: "-79.987654321" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.lat).toBe(21.123457);
      expect(out.value.lng).toBe(-79.987654);
    }
  });

  it("normaliza priceCup numerico o string, redondeado", () => {
    const out = parseReportIntake({ ...BASE, ...PIN, priceCup: "150.6" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.priceCup).toBe(151);

    const zero = parseReportIntake({ ...BASE, ...PIN, priceCup: "" });
    expect(zero.ok).toBe(true);
    if (zero.ok) expect(zero.value.priceCup).toBeNull();
  });

  it("rechaza priceCup fuera de rango", () => {
    expect(parseReportIntake({ ...BASE, ...PIN, priceCup: -1 })).toEqual({
      ok: false,
      error: "invalid_price",
    });
    expect(parseReportIntake({ ...BASE, ...PIN, priceCup: 2_000_000 })).toEqual({
      ok: false,
      error: "invalid_price",
    });
  });

  it("acepta queueLevel entero 1..3 y rechaza el resto", () => {
    const ok = parseReportIntake({ ...BASE, ...PIN, queueLevel: 2 });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.queueLevel).toBe(2);

    expect(parseReportIntake({ ...BASE, ...PIN, queueLevel: 0 })).toEqual({
      ok: false,
      error: "invalid_queue",
    });
    expect(parseReportIntake({ ...BASE, ...PIN, queueLevel: 1.5 })).toEqual({
      ok: false,
      error: "invalid_queue",
    });
  });

  it("recorta comment y descarta vacio", () => {
    const out = parseReportIntake({ ...BASE, ...PIN, comment: "  hay poco  " });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.comment).toBe("hay poco");
  });

  it("rechaza availability desconocida y producto vacio", () => {
    expect(
      parseReportIntake({ ...BASE, availability: "maybe", ...PIN }),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(parseReportIntake({ productId: "", availability: "available", ...PIN })).toEqual({
      ok: false,
      error: "invalid_input",
    });
  });

  it("ignora campos desconocidos", () => {
    const out = parseReportIntake({ ...BASE, ...PIN, flow: "B", storeKind: "mipyme" });
    expect(out.ok).toBe(true);
  });
});
