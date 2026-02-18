import { z } from "zod/v4";

export const createBlogPostSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  excerpt: z.string().min(10, "Excerpt must be at least 10 characters"),
  content: z.string().min(20, "Content must be at least 20 characters"),
  categoryId: z.string().min(1, "Category is required"),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  readTime: z.string().optional(),
});

export const createCategorySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  nameAr: z.string().min(2, "Arabic name is required"),
  nameEn: z.string().min(2, "English name is required"),
});

export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
