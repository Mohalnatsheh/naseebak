import { describe, it, expect } from "vitest";
import { personSearch } from "@/lib/admin/search";

describe("personSearch", () => {
  it("ignores an empty query", () => {
    expect(personSearch("  ")).toBeNull();
    expect(personSearch(null)).toBeNull();
  });
  it("matches names word by word", () => {
    const w = personSearch("يزن حسان")!;
    expect(w.OR).toHaveLength(4);
  });
  it("tries the 962 form of a local phone", () => {
    const w = personSearch("0777000002")!;
    expect(w.OR).toContainEqual({ phone: { contains: "962777000002" } });
  });
});
