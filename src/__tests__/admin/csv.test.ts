import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/admin/csv";

describe("toCsv", () => {
  it("quotes commas, quotes and new lines; empty for null", () => {
    expect(toCsv([["a,b", 'say "hi"', "two\nlines", null, undefined, 7]])).toBe('"a,b","say ""hi""","two\nlines",,,7');
  });

  it("a cell Excel would run as a formula becomes plain text", () => {
    expect(toCsv([["=HYPERLINK(1)", "+962", "@x", "-1", "سارة"]])).toBe("'=HYPERLINK(1),'+962,'@x,'-1,سارة");
  });
});
