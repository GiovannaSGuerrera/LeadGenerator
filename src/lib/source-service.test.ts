import { describe, expect, it } from "vitest";
import { MockSourceAdapter } from "./source-service";

describe("MockSourceAdapter", () => {
  it("keeps the two modes separated", async () => {
    const results = await new MockSourceAdapter().search({ mode: "business_without_website" });
    expect(results.every((lead) => lead.mode === "business_without_website")).toBe(true);
    expect(results.every((lead) => lead.isMock)).toBe(true);
  });
  it("filters by neighborhood", async () => {
    const results = await new MockSourceAdapter().search({ mode: "business_without_website", neighborhood: "Pinheiros" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Café do Beco");
  });
});
