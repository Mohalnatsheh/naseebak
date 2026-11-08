import { describe, it, expect } from "vitest";
import { homeZeroCreditLine } from "@/lib/suggestions/copy";

describe("homeZeroCreditLine (dashboard home at 0 credits)", () => {
  it("switch off: the recharge line for any waiting card", () => {
    expect(homeZeroCreditLine({ freeReply: false, likedYou: 1, fresh: 0, female: false })).toBe("انتهى رصيدك: اشحن رصيدك لتقول «مهتم».");
    expect(homeZeroCreditLine({ freeReply: false, likedYou: 0, fresh: 2, female: true })).toBe("انتهى رصيدكِ: اشحني رصيدكِ لتقولي «مهتم».");
  });

  it("free reply on, only replies waiting: nothing to recharge", () => {
    expect(homeZeroCreditLine({ freeReply: true, likedYou: 2, fresh: 0, female: true })).toBeNull();
  });

  it("free reply on with new cards too: says the reply is free and the recharge is for new ones", () => {
    const line = homeZeroCreditLine({ freeReply: true, likedYou: 1, fresh: 3, female: false })!;
    expect(line).toContain("الرد بـ«مهتم» مجاني");
    expect(line).toContain("للاقتراحات الجديدة");
  });

  it("nothing waiting: no line", () => {
    expect(homeZeroCreditLine({ freeReply: false, likedYou: 0, fresh: 0, female: false })).toBeNull();
  });
});
