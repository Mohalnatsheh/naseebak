import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  blogPost: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  blogCategory: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireAdmin: async () => ({ session: { user: { id: "a1" } } }) }));
vi.mock("@/lib/admin/country-filter", () => ({ getAdminCountry: async () => admin.country }));
const admin = vi.hoisted(() => ({ country: "SA" as string }));

import { getPublishedPost, listBlogCategories, listPublishedPosts, listPublishedPostTitles } from "@/lib/blog";
import { GET as publicList } from "@/app/api/blog/route";
import { GET as adminList, POST as adminCreate } from "@/app/api/admin/blog/route";
import { PUT as adminUpdate } from "@/app/api/admin/blog/[id]/route";
import { NextRequest } from "next/server";

const post = { title: "عنوان المقال", slug: "a-post", excerpt: "مقتطف المقال هنا", content: "نص المقال الكامل هنا طويل بما يكفي", categoryId: "c1", status: "DRAFT" };
const req = (url: string, body?: unknown) => new NextRequest(url, body ? { method: "POST", body: JSON.stringify(body) } : undefined);

beforeEach(() => {
  vi.clearAllMocks();
  admin.country = "SA";
  db.blogPost.findMany.mockResolvedValue([]);
  db.blogPost.count.mockResolvedValue(0);
  db.blogPost.findUnique.mockResolvedValue(null);
  db.blogPost.create.mockResolvedValue({});
  db.blogPost.update.mockResolvedValue({});
  db.blogCategory.findMany.mockResolvedValue([]);
});

describe("blog reads by country", () => {
  it("a post opens only in its own country", async () => {
    await getPublishedPost("x", "SA");
    expect(db.blogPost.findUnique.mock.calls[0][0].where).toEqual({ slug: "x", status: "PUBLISHED", country: "SA" });
  });

  it("the list shows only the country's posts", async () => {
    await listPublishedPosts({ country: "SA" });
    expect(db.blogPost.findMany.mock.calls[0][0].where).toMatchObject({ status: "PUBLISHED", country: "SA" });
    expect(db.blogPost.count.mock.calls[0][0].where).toMatchObject({ country: "SA" });
  });

  it("links only to posts of the same country", async () => {
    await listPublishedPostTitles("SA");
    expect(db.blogPost.findMany.mock.calls[0][0].where).toEqual({ status: "PUBLISHED", country: "SA" });
  });

  it("category counts follow the country", async () => {
    await listBlogCategories("SA");
    expect(db.blogCategory.findMany.mock.calls[0][0].include._count.select.posts.where).toEqual({ status: "PUBLISHED", country: "SA" });
  });

  it("the public list reads ?country and means Jordan without it", async () => {
    await publicList(req("http://x/api/blog?country=sa"));
    expect(db.blogPost.findMany.mock.calls[0][0].where.country).toBe("SA");
    await publicList(req("http://x/api/blog"));
    expect(db.blogPost.findMany.mock.calls[1][0].where.country).toBe("JO");
  });
});

describe("admin posts by country", () => {
  it("lists the country chosen in the admin bar", async () => {
    await adminList(req("http://x/api/admin/blog"));
    expect(db.blogPost.findMany.mock.calls[0][0].where).toEqual({ country: "SA" });
    expect(db.blogPost.count.mock.calls[0][0].where).toEqual({ country: "SA" });
  });

  it("lists everything for All countries", async () => {
    admin.country = "ALL";
    await adminList(req("http://x/api/admin/blog"));
    expect(db.blogPost.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("saves a new post's country, Jordan when none is sent", async () => {
    await adminCreate(req("http://x/api/admin/blog", { ...post, country: "SA" }));
    expect(db.blogPost.create.mock.calls[0][0].data.country).toBe("SA");
    await adminCreate(req("http://x/api/admin/blog", post));
    expect(db.blogPost.create.mock.calls[1][0].data.country).toBe("JO");
  });

  it("refuses an unknown country", async () => {
    expect((await adminCreate(req("http://x/api/admin/blog", { ...post, country: "EG" }))).status).toBe(400);
  });

  it("an edit without a country leaves the post's country", async () => {
    db.blogPost.findUnique.mockResolvedValue({ id: "p1", slug: "a-post", publishedAt: null });
    await adminUpdate(req("http://x", post), { params: Promise.resolve({ id: "p1" }) });
    expect(db.blogPost.update.mock.calls[0][0].data.country).toBeUndefined();
  });
});
