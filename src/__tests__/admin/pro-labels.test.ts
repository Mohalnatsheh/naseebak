import { describe, it, expect } from "vitest";
import { paymentPlanLabel, proPlanLabel } from "@/lib/admin/pro-labels";

describe("admin Pro labels", () => {
  it("labels Pro payments and leaves credit packages alone", () => {
    expect(paymentPlanLabel("pro_monthly")).toBe("Pro · Monthly");
    expect(paymentPlanLabel("pro_weekly")).toBe("Pro · Weekly");
    expect(paymentPlanLabel("pro_yearly")).toBe("Pro · Yearly");
    expect(paymentPlanLabel("launch_10")).toBe("launch_10");
    expect(paymentPlanLabel("pro_daily")).toBe("pro_daily");
    expect(paymentPlanLabel(null)).toBe("—");
  });
  it("labels a plan id", () => {
    expect(proPlanLabel("yearly")).toBe("Pro · Yearly");
    expect(proPlanLabel("MONTHLY")).toBe("Pro · Monthly");
  });
});
