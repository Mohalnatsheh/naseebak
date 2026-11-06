import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { Navbar } from "@/components/shared/navbar";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
});

const blogLink = () => screen.getAllByRole("link", { name: "المدونة" })[0];

describe("Navbar on the country URLs", () => {
  it.each(["/", "/sa"])("%s is the home page: light text over the navy hero", (path) => {
    nav.path = path;
    render(<Navbar />);
    expect(blogLink().className).toContain("text-white/75");
  });

  it("marks the current page on a Saudi URL too", () => {
    nav.path = "/sa/blog";
    render(<Navbar />);
    expect(blogLink().className).toContain("bg-primary");
  });
});
