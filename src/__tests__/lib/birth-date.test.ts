import { describe, it, expect } from "vitest";
import { birthYearOptions, changeDobPart, daysInMonth, isPartialDob, joinDob, splitDob, EMPTY_DOB } from "@/lib/birth-date";
import { dateOfBirthError } from "@/lib/validations/profile";

describe("birth date lists", () => {
  it("knows month lengths and leap years", () => {
    expect(daysInMonth(4, 1999)).toBe(30);
    expect(daysInMonth(2, 2001)).toBe(28);
    expect(daysInMonth(2, 2000)).toBe(29);
    expect(daysInMonth(2)).toBe(29); // no year yet: don't refuse 29
    expect(daysInMonth(0)).toBe(31);
  });

  it("offers years from 18 to 80 years ago, newest first", () => {
    const years = birthYearOptions(new Date("2026-11-03T10:00:00Z"));
    expect(years[0]).toBe(2008);
    expect(years.at(-1)).toBe(1945);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it("joins only complete, real dates into YYYY-MM-DD", () => {
    expect(joinDob({ day: "5", month: "3", year: "1998" })).toBe("1998-03-05");
    expect(joinDob({ day: "31", month: "4", year: "1998" })).toBe("");
    expect(joinDob({ day: "29", month: "2", year: "2001" })).toBe("");
    expect(joinDob({ day: "", month: "3", year: "1998" })).toBe("");
    expect(joinDob(EMPTY_DOB)).toBe("");
  });

  it("splits stored values back, ISO included", () => {
    expect(splitDob("1998-03-05")).toEqual({ day: "5", month: "3", year: "1998" });
    expect(splitDob("1998-03-05T00:00:00.000Z")).toEqual({ day: "5", month: "3", year: "1998" });
    expect(splitDob("")).toEqual(EMPTY_DOB);
    expect(splitDob(null)).toEqual(EMPTY_DOB);
    expect(joinDob(splitDob("2000-12-31"))).toBe("2000-12-31");
  });

  it("clears a day the new month or year doesn't have", () => {
    const p = { day: "31", month: "1", year: "1999" };
    expect(changeDobPart(p, "month", "4")).toEqual({ day: "", month: "4", year: "1999" });
    expect(changeDobPart({ day: "29", month: "2", year: "2000" }, "year", "2001").day).toBe("");
    expect(changeDobPart({ day: "15", month: "1", year: "1999" }, "month", "2").day).toBe("15");
  });

  it("tells a half-filled date apart from an empty one", () => {
    expect(isPartialDob(EMPTY_DOB)).toBe(false);
    expect(isPartialDob({ day: "1", month: "", year: "" })).toBe(true);
    expect(isPartialDob({ day: "1", month: "1", year: "1990" })).toBe(false);
  });

  it("gives the same value the server's 18+ rule reads", () => {
    const now = new Date("2026-11-03T10:00:00Z");
    expect(dateOfBirthError(joinDob({ day: "3", month: "11", year: "2008" }), now)).toBeNull();
    expect(dateOfBirthError(joinDob({ day: "4", month: "11", year: "2008" }), now)).toMatch(/18/);
  });
});
