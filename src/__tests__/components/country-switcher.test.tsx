import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ path: "/", push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
}));

import { CountrySwitcher, VisitorCountryProvider } from "@/components/shared/visitor-country";

const assign = vi.fn();

function pick(name: string) {
  render(
    <VisitorCountryProvider country="JO" countries={["JO", "SA"]}>
      <CountrySwitcher variant="row" />
    </VisitorCountryProvider>,
  );
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(name) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  nav.path = "/";
  vi.stubGlobal("location", { hash: "", protocol: "https:", assign });
});
afterEach(() => vi.unstubAllGlobals());

describe("CountrySwitcher", () => {
  // /sa and / are the same route to the client router: an in-app move keeps Jordan's layout and text
  it("loads the other country's URL in full", () => {
    pick("السعودية");
    expect(assign).toHaveBeenCalledWith("/sa");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("keeps the page: /faq goes to /sa/faq", () => {
    nav.path = "/faq";
    pick("السعودية");
    expect(assign).toHaveBeenCalledWith("/sa/faq");
  });

  it("re-renders a page with no country URL", () => {
    nav.path = "/login";
    pick("السعودية");
    expect(assign).not.toHaveBeenCalled();
    expect(nav.refresh).toHaveBeenCalled();
  });
});
