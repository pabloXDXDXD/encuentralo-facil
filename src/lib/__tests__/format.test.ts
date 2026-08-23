import { describe, expect, it } from "vitest";
import { formatPrice, kindLabel, queueLabel, timeAgo } from "@/lib/format";

describe("timeAgo", () => {
  it("says 'ahora mismo' under a minute", () => {
    const now = new Date();
    expect(timeAgo(now)).toBe("ahora mismo");
  });

  it("formats minutes", () => {
    const d = new Date(Date.now() - 30 * 60_000);
    expect(timeAgo(d)).toBe("hace 30 min");
  });

  it("formats hours", () => {
    const d = new Date(Date.now() - 90 * 60_000);
    expect(timeAgo(d)).toBe("hace 1 h");
  });
});

describe("formatPrice", () => {
  it("returns empty string for null", () => {
    expect(formatPrice(null)).toBe("");
  });

  it("prefixes dollars and groups digits", () => {
    const out = formatPrice(1850);
    expect(out.startsWith("$")).toBe(true);
    expect(out).toContain("1");
    expect(out).toContain("850");
  });
});

describe("queueLabel", () => {
  it("maps levels 1..3", () => {
    expect(queueLabel(1).toLowerCase()).toContain("corta");
    expect(queueLabel(2).toLowerCase()).toContain("media");
    expect(queueLabel(3).toLowerCase()).toContain("larga");
  });

  it("returns empty for falsy levels", () => {
    expect(queueLabel(null)).toBe("");
    expect(queueLabel(0)).toBe("");
  });
});

describe("kindLabel", () => {
  it("maps known kinds and falls back", () => {
    expect(kindLabel("mipyme")).toBe("MIPYME");
    expect(kindLabel("whatever")).toBe("Tienda");
  });
});
