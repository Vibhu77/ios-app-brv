import { nf } from "@/src/lib/format";

describe("nf", () => {
  it("formats a number with thousands separators", () => {
    expect(nf(1234)).toBe("1,234");
  });

  it("rounds to the nearest integer", () => {
    expect(nf(2.6)).toBe("3");
  });

  it("returns '0' for undefined/null", () => {
    expect(nf(undefined)).toBe("0");
    expect(nf(null as unknown as number)).toBe("0");
  });
});
