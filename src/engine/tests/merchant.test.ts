import { normalizeMerchant } from "../domain/merchant";

describe("normalizeMerchant", () => {
  it("lowercases and strips numbers/punctuation", () => {
    expect(normalizeMerchant("WOOLWORTHS 3345 BRISBANE")).toBe("woolworths brisbane");
    expect(normalizeMerchant("Netflix.com AU 12/01")).toBe("netflixcom au");
  });

  it("collapses whitespace", () => {
    expect(normalizeMerchant("  Uber    Eats   ")).toBe("uber eats");
  });

  it("handles empty input", () => {
    expect(normalizeMerchant("")).toBe("unknown");
  });
});
