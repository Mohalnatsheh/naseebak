import { describe, it, expect } from "vitest";
import { createBlogPostSchema, createCategorySchema } from "@/lib/validations/blog";

describe("createBlogPostSchema", () => {
  const validPost = {
    title: "10 نصائح ذهبية لاختيار شريك الحياة",
    slug: "10-tips-for-choosing-partner",
    excerpt: "اختيار شريك الحياة من أهم القرارات. تعرّف على أهم المعايير.",
    content: "هذا هو المحتوى الكامل للمقال الذي يتضمن الكثير من النصائح المفيدة.",
    categoryId: "cat_123",
    status: "DRAFT" as const,
    readTime: "5 دقائق",
  };

  it("should accept valid blog post data", () => {
    const result = createBlogPostSchema.safeParse(validPost);
    expect(result.success).toBe(true);
  });

  it("should accept PUBLISHED status", () => {
    const result = createBlogPostSchema.safeParse({ ...validPost, status: "PUBLISHED" });
    expect(result.success).toBe(true);
  });

  it("should default status to DRAFT when not provided", () => {
    const noStatus: Partial<typeof validPost> = { ...validPost };
    delete noStatus.status;
    const result = createBlogPostSchema.safeParse(noStatus);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("DRAFT");
    }
  });

  it("should accept post without readTime", () => {
    const noReadTime: Partial<typeof validPost> = { ...validPost };
    delete noReadTime.readTime;
    const result = createBlogPostSchema.safeParse(noReadTime);
    expect(result.success).toBe(true);
  });

  it("should reject invalid slug with spaces", () => {
    const result = createBlogPostSchema.safeParse({ ...validPost, slug: "invalid slug" });
    expect(result.success).toBe(false);
  });

  it("should reject slug with uppercase", () => {
    const result = createBlogPostSchema.safeParse({ ...validPost, slug: "Invalid-Slug" });
    expect(result.success).toBe(false);
  });

  it("should reject short title", () => {
    const result = createBlogPostSchema.safeParse({ ...validPost, title: "ab" });
    expect(result.success).toBe(false);
  });

  it("should reject short excerpt", () => {
    const result = createBlogPostSchema.safeParse({ ...validPost, excerpt: "short" });
    expect(result.success).toBe(false);
  });

  it("should reject short content", () => {
    const result = createBlogPostSchema.safeParse({ ...validPost, content: "too short" });
    expect(result.success).toBe(false);
  });

  it("should reject empty categoryId", () => {
    const result = createBlogPostSchema.safeParse({ ...validPost, categoryId: "" });
    expect(result.success).toBe(false);
  });

  it("should reject invalid status", () => {
    const result = createBlogPostSchema.safeParse({ ...validPost, status: "ARCHIVED" });
    expect(result.success).toBe(false);
  });

  it("should reject missing required fields", () => {
    const result = createBlogPostSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("createCategorySchema", () => {
  const validCategory = {
    slug: "tips",
    nameAr: "نصائح زوجية",
    nameEn: "Marriage Tips",
  };

  it("should accept valid category data", () => {
    const result = createCategorySchema.safeParse(validCategory);
    expect(result.success).toBe(true);
  });

  it("should accept slug with hyphens", () => {
    const result = createCategorySchema.safeParse({ ...validCategory, slug: "self-development" });
    expect(result.success).toBe(true);
  });

  it("should reject slug with spaces", () => {
    const result = createCategorySchema.safeParse({ ...validCategory, slug: "invalid slug" });
    expect(result.success).toBe(false);
  });

  it("should reject slug with uppercase", () => {
    const result = createCategorySchema.safeParse({ ...validCategory, slug: "Tips" });
    expect(result.success).toBe(false);
  });

  it("should reject short nameAr", () => {
    const result = createCategorySchema.safeParse({ ...validCategory, nameAr: "ن" });
    expect(result.success).toBe(false);
  });

  it("should reject short nameEn", () => {
    const result = createCategorySchema.safeParse({ ...validCategory, nameEn: "T" });
    expect(result.success).toBe(false);
  });

  it("should reject missing fields", () => {
    const result = createCategorySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
