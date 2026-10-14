"use client";

import { useState, useEffect } from "react";
import { FileText, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

/* ──────────────────── Types ──────────────────── */

interface Category {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  _count: { posts: number };
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: "DRAFT" | "PUBLISHED";
  categoryId: string;
  readTime: string | null;
  publishedAt: string | null;
  createdAt: string;
  category: { id: string; nameEn: string; nameAr: string; slug: string };
}

/* ──────────────────── Helpers ──────────────────── */

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/* ══════════════════════════════════════════════════ */

export default function AdminBlogPage() {
  /* ── Posts state ── */
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotalPages, setPostsTotalPages] = useState(1);
  const [postsLoading, setPostsLoading] = useState(true);

  /* ── Categories state ── */
  const [categories, setCategories] = useState<Category[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);

  /* ── Post dialog ── */
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [postForm, setPostForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    categoryId: "",
    status: "DRAFT" as "DRAFT" | "PUBLISHED",
    readTime: "",
  });
  const [postSaving, setPostSaving] = useState(false);
  const [postError, setPostError] = useState("");

  /* ── Category form ── */
  const [catForm, setCatForm] = useState({ slug: "", nameAr: "", nameEn: "" });
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState("");
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editCatForm, setEditCatForm] = useState({ slug: "", nameAr: "", nameEn: "" });
  const [editCatSaving, setEditCatSaving] = useState(false);

  /* ──────────────────── Fetchers ──────────────────── */

  async function fetchPosts() {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/admin/blog?page=${postsPage}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setPostsTotalPages(data.totalPages || 1);
    } catch {
      console.error("Failed to fetch posts");
    } finally {
      setPostsLoading(false);
    }
  }

  async function fetchCategories() {
    setCatsLoading(true);
    try {
      const res = await fetch("/api/admin/blog/categories");
      const data = await res.json();
      setCategories(data.categories || []);
    } catch {
      console.error("Failed to fetch categories");
    } finally {
      setCatsLoading(false);
    }
  }

  useEffect(() => { fetchPosts(); }, [postsPage]);
  useEffect(() => { fetchCategories(); }, []);

  /* ──────────────────── Post CRUD ──────────────────── */

  function openNewPost() {
    setEditingPost(null);
    setPostForm({ title: "", slug: "", excerpt: "", content: "", categoryId: categories[0]?.id || "", status: "DRAFT", readTime: "" });
    setPostError("");
    setPostDialogOpen(true);
  }

  function openEditPost(post: BlogPost) {
    setEditingPost(post);
    setPostForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      categoryId: post.categoryId,
      status: post.status,
      readTime: post.readTime || "",
    });
    setPostError("");
    setPostDialogOpen(true);
  }

  async function savePost() {
    setPostSaving(true);
    setPostError("");
    try {
      const url = editingPost ? `/api/admin/blog/${editingPost.id}` : "/api/admin/blog";
      const method = editingPost ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setPostError(data.error || "Failed to save");
        return;
      }
      setPostDialogOpen(false);
      fetchPosts();
    } catch {
      setPostError("Network error");
    } finally {
      setPostSaving(false);
    }
  }

  async function deletePost(id: string) {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      await fetch(`/api/admin/blog/${id}`, { method: "DELETE" });
      fetchPosts();
    } catch {
      console.error("Failed to delete post");
    }
  }

  /* ──────────────────── Category CRUD ──────────────────── */

  async function createCategory() {
    setCatSaving(true);
    setCatError("");
    try {
      const res = await fetch("/api/admin/blog/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(catForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setCatError(data.error || "Failed to create");
        return;
      }
      setCatForm({ slug: "", nameAr: "", nameEn: "" });
      fetchCategories();
    } catch {
      setCatError("Network error");
    } finally {
      setCatSaving(false);
    }
  }

  function openEditCategory(cat: Category) {
    setEditingCat(cat);
    setEditCatForm({ slug: cat.slug, nameAr: cat.nameAr, nameEn: cat.nameEn });
  }

  async function saveEditCategory() {
    if (!editingCat) return;
    setEditCatSaving(true);
    try {
      const res = await fetch(`/api/admin/blog/categories/${editingCat.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editCatForm),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update");
        return;
      }
      setEditingCat(null);
      fetchCategories();
    } catch {
      alert("Network error");
    } finally {
      setEditCatSaving(false);
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm("Are you sure you want to delete this category?")) return;
    try {
      const res = await fetch(`/api/admin/blog/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete");
        return;
      }
      fetchCategories();
    } catch {
      console.error("Failed to delete category");
    }
  }

  /* ══════════════════════════════════════════════════ */
  /*                      RENDER                        */
  /* ══════════════════════════════════════════════════ */

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <FileText className="h-7 w-7 text-primary" />
          Blog Management
        </h1>
        <p className="text-muted-foreground mt-1">Create and manage blog posts and categories</p>
      </div>

      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        {/* ═══════════ POSTS TAB ═══════════ */}
        <TabsContent value="posts">
          <Card>
            <CardContent className="p-0">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <p className="text-sm text-muted-foreground">
                  {posts.length} post{posts.length !== 1 && "s"}
                </p>
                <Button size="sm" onClick={openNewPost}>
                  <Plus className="h-4 w-4 mr-1" />
                  New Post
                </Button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 text-sm font-medium">Title</th>
                      <th className="text-left p-3 text-sm font-medium">Category</th>
                      <th className="text-left p-3 text-sm font-medium">Status</th>
                      <th className="text-left p-3 text-sm font-medium">Published</th>
                      <th className="text-left p-3 text-sm font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          <td colSpan={5} className="p-3">
                            <div className="h-6 bg-muted animate-pulse rounded" />
                          </td>
                        </tr>
                      ))
                    ) : posts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center p-8 text-muted-foreground">
                          No posts yet
                        </td>
                      </tr>
                    ) : (
                      posts.map((post) => (
                        <tr key={post.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <p className="font-medium text-sm">{post.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 break-all">/{post.slug}</p>
                          </td>
                          <td className="p-3">
                            <Badge variant="secondary" className="text-xs">
                              {post.category.nameEn}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={post.status === "PUBLISHED" ? "default" : "outline"}
                              className="text-xs"
                            >
                              {post.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {post.publishedAt
                              ? new Date(post.publishedAt).toLocaleDateString()
                              : "—"}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditPost(post)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deletePost(post.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {postsTotalPages > 1 && (
                <div className="flex items-center justify-between p-3 border-t">
                  <p className="text-sm text-muted-foreground">Page {postsPage} of {postsTotalPages}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={postsPage <= 1} onClick={() => setPostsPage(postsPage - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={postsPage >= postsTotalPages} onClick={() => setPostsPage(postsPage + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ CATEGORIES TAB ═══════════ */}
        <TabsContent value="categories">
          <Card>
            <CardContent className="p-4 space-y-6">
              {/* Add category form */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Add Category
                </h3>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="cat-slug" className="text-xs">Slug</Label>
                    <Input
                      id="cat-slug"
                      placeholder="e.g. tips"
                      className="w-full sm:w-36"
                      value={catForm.slug}
                      onChange={(e) => setCatForm({ ...catForm, slug: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cat-name-ar" className="text-xs">Arabic Name</Label>
                    <Input
                      id="cat-name-ar"
                      placeholder="نصائح زوجية"
                      className="w-full sm:w-44"
                      value={catForm.nameAr}
                      onChange={(e) => setCatForm({ ...catForm, nameAr: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cat-name-en" className="text-xs">English Name</Label>
                    <Input
                      id="cat-name-en"
                      placeholder="Marriage Tips"
                      className="w-full sm:w-44"
                      value={catForm.nameEn}
                      onChange={(e) => setCatForm({ ...catForm, nameEn: e.target.value })}
                    />
                  </div>
                  <Button size="sm" className="w-full sm:w-auto" onClick={createCategory} disabled={catSaving}>
                    {catSaving ? "Adding..." : "Add"}
                  </Button>
                </div>
                {catError && <p className="text-xs text-destructive">{catError}</p>}
              </div>

              {/* Categories table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 text-sm font-medium">English Name</th>
                      <th className="text-left p-3 text-sm font-medium">Arabic Name</th>
                      <th className="text-left p-3 text-sm font-medium">Slug</th>
                      <th className="text-left p-3 text-sm font-medium">Posts</th>
                      <th className="text-left p-3 text-sm font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catsLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          <td colSpan={5} className="p-3">
                            <div className="h-6 bg-muted animate-pulse rounded" />
                          </td>
                        </tr>
                      ))
                    ) : categories.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center p-8 text-muted-foreground">
                          No categories yet
                        </td>
                      </tr>
                    ) : (
                      categories.map((cat) => (
                        editingCat?.id === cat.id ? (
                          <tr key={cat.id} className="border-b bg-muted/20">
                            <td className="p-2">
                              <Input
                                className="h-8 text-sm"
                                value={editCatForm.nameEn}
                                onChange={(e) => setEditCatForm({ ...editCatForm, nameEn: e.target.value })}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                className="h-8 text-sm"
                                value={editCatForm.nameAr}
                                onChange={(e) => setEditCatForm({ ...editCatForm, nameAr: e.target.value })}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                className="h-8 text-sm"
                                value={editCatForm.slug}
                                onChange={(e) => setEditCatForm({ ...editCatForm, slug: e.target.value })}
                              />
                            </td>
                            <td className="p-3 text-sm">{cat._count.posts}</td>
                            <td className="p-3">
                              <div className="flex gap-1">
                                <Button size="sm" className="h-9 text-xs" onClick={saveEditCategory} disabled={editCatSaving}>
                                  {editCatSaving ? "..." : "Save"}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setEditingCat(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={cat.id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="p-3 text-sm font-medium">{cat.nameEn}</td>
                            <td className="p-3 text-sm">{cat.nameAr}</td>
                            <td className="p-3 text-sm text-muted-foreground">{cat.slug}</td>
                            <td className="p-3 text-sm">{cat._count.posts}</td>
                            <td className="p-3">
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEditCategory(cat)}
                                  title="Edit category"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  disabled={cat._count.posts > 0}
                                  onClick={() => deleteCategory(cat.id)}
                                  title={cat._count.posts > 0 ? "Cannot delete category with posts" : "Delete category"}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════════ POST DIALOG ═══════════ */}
      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPost ? "Edit Post" : "New Post"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title"
                value={postForm.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setPostForm({
                    ...postForm,
                    title,
                    slug: editingPost ? postForm.slug : slugify(title),
                  });
                }}
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <Label htmlFor="post-slug">Slug</Label>
              <Input
                id="post-slug"
                value={postForm.slug}
                onChange={(e) => setPostForm({ ...postForm, slug: e.target.value })}
              />
            </div>

            {/* Excerpt */}
            <div className="space-y-1.5">
              <Label htmlFor="post-excerpt">Excerpt</Label>
              <textarea
                id="post-excerpt"
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                value={postForm.excerpt}
                onChange={(e) => setPostForm({ ...postForm, excerpt: e.target.value })}
              />
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <Label htmlFor="post-content">Content</Label>
              <textarea
                id="post-content"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={6}
                value={postForm.content}
                onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
              />
            </div>

            {/* Category + Status + ReadTime row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="post-category">Category</Label>
                <select
                  id="post-category"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={postForm.categoryId}
                  onChange={(e) => setPostForm({ ...postForm, categoryId: e.target.value })}
                >
                  <option value="">Select...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nameEn}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="post-status">Status</Label>
                <select
                  id="post-status"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={postForm.status}
                  onChange={(e) => setPostForm({ ...postForm, status: e.target.value as "DRAFT" | "PUBLISHED" })}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="post-readtime">Read Time</Label>
                <Input
                  id="post-readtime"
                  placeholder="5 دقائق"
                  value={postForm.readTime}
                  onChange={(e) => setPostForm({ ...postForm, readTime: e.target.value })}
                />
              </div>
            </div>

            {postError && <p className="text-sm text-destructive">{postError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPostDialogOpen(false)}>Cancel</Button>
            <Button onClick={savePost} disabled={postSaving}>
              {postSaving ? "Saving..." : editingPost ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
