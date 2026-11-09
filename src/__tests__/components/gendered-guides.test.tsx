import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const ctx = vi.hoisted(() => ({ gender: "FEMALE" }));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ profile: { gender: ctx.gender } }) }));

import { UnblockSteps } from "@/components/shared/install-guide";
import type { Device } from "@/lib/install-env";

const ios = { os: "ios", browser: "safari", inApp: null, standalone: true } as unknown as Device;

describe("install and notification guides follow the member's gender (QA WA-11)", () => {
  it("speaks to a woman in the feminine", () => {
    ctx.gender = "FEMALE";
    const { container } = render(<UnblockSteps device={ios} />);
    expect(container.textContent).toContain("افتحي");
    expect(container.textContent).toContain("اختاري");
    expect(container.textContent).not.toMatch(/(^|\s)اختر(\s|$)/);
  });
  it("and to a man in the masculine", () => {
    ctx.gender = "MALE";
    const { container } = render(<UnblockSteps device={ios} />);
    expect(container.textContent).toContain("افتح ");
    expect(container.textContent).not.toContain("افتحي");
  });
});
