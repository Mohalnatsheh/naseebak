import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePostContent, type PostBlock } from "@/lib/blog-content";

const SOURCES = join(process.cwd(), "docs/blog");

/** A source file as the post is stored: the text after the `---` header (if any), minus its title line */
function loadPost(file: string) {
  const raw = readFileSync(join(SOURCES, file), "utf8");
  const body = raw.includes("\n---\n") ? raw.split("\n---\n")[1].trim() : raw.trim();
  const [title, ...rest] = body.split("\n");
  return { slug: file.replace(".txt", ""), title, content: rest.join("\n").trim() };
}

const posts = readdirSync(SOURCES).filter((f) => f.endsWith(".txt")).map(loadPost);
const post = (slug: string) => posts.find((p) => p.slug === slug)!;
const others = (slug: string) => posts.filter((p) => p.slug !== slug);

const headings = (blocks: PostBlock[], type: "h2" | "h3") =>
  blocks.flatMap((b) => (b.type === type ? [b.text] : []));

const links = (blocks: PostBlock[]) =>
  blocks.flatMap((b) => {
    const lines = b.type === "p" ? [b.parts] : b.type === "ul" ? b.items : [];
    return lines.flat().flatMap((part) => (typeof part === "string" || "url" in part ? [] : [part]));
  });

/** All the words of the post back out of its blocks, whatever kind of block they landed in */
const words = (blocks: PostBlock[]) =>
  blocks
    .flatMap((b) => {
      if ("text" in b) return [b.text];
      const lines = b.type === "p" ? [b.parts] : b.items;
      return lines.map((line) => line.map((part) => (typeof part === "string" ? part : "url" in part ? part.url : part.text)).join(""));
    })
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);

describe("parsePostContent — section titles", () => {
  it("makes a short standalone line an h2", () => {
    const blocks = parsePostContent("مقدمة قصيرة تنتهي بنقطة.\n\nكيف يعمل نصيبك؟\n\nنص القسم هنا.");
    expect(blocks).toEqual([
      { type: "p", parts: ["مقدمة قصيرة تنتهي بنقطة."] },
      { type: "h2", text: "كيف يعمل نصيبك؟" },
      { type: "p", parts: ["نص القسم هنا."] },
    ]);
  });

  it("makes a short first line directly above its text an h3", () => {
    expect(parsePostContent("رسوم عقد الزواج\nالرسوم 40 ديناراً.\n\nنهاية المقال.")).toEqual([
      { type: "h3", text: "رسوم عقد الزواج" },
      { type: "p", parts: ["الرسوم 40 ديناراً."] },
      { type: "p", parts: ["نهاية المقال."] },
    ]);
  });

  it.each([
    ["a sentence with a full stop", "هذه جملة كاملة."],
    ["a line introducing a list", "لكل طريقة ما يميزها:"],
    ["a sentence closing a quote", "وقال لنا «هذا هو الطريق.»"],
    ["a Quran verse", "﴿ وَجَعَلَ بَيْنَكُم مَّوَدَّةً وَرَحْمَةً ﴾"],
    ["a web address", "naseebak.com"],
  ])("keeps %s as a paragraph", (_name, line) => {
    expect(parsePostContent(`${line}\n\nنص بعده.`)[0].type).toBe("p");
  });

  it("keeps a long unpunctuated line as a paragraph", () => {
    const line = "كلمة ".repeat(30).trim();
    expect(parsePostContent(`${line}\n\nنص بعده.`)[0].type).toBe("p");
  });

  it("never ends the post on a heading", () => {
    expect(parsePostContent("نص المقال.\n\nسطر أخير دون نقطة").at(-1)?.type).toBe("p");
  });
});

describe("parsePostContent — lists and plain text", () => {
  it.each(["•", "-"])("turns %s lines into one list, with the line above them as a paragraph", (mark) => {
    expect(parsePostContent(`ومن أهمها:\n${mark} الأول.\n${mark} الثاني.`)).toEqual([
      { type: "p", parts: ["ومن أهمها:"] },
      { type: "ul", items: [["الأول."], ["الثاني."]] },
    ]);
  });

  it("keeps a line break inside a paragraph", () => {
    expect(parsePostContent("السطر الأول.\nالسطر الثاني.")).toEqual([
      { type: "p", parts: ["السطر الأول.\nالسطر الثاني."] },
    ]);
  });

  it("reads Windows line endings from the admin form", () => {
    expect(parsePostContent("كيف يعمل؟\r\n\r\nنص.\r\n").map((b) => b.type)).toEqual(["h2", "p"]);
  });

  it("drops a first line that repeats the post title", () => {
    const blocks = parsePostContent("عنوان المقال\n\nنص.", { title: "عنوان المقال" });
    expect(blocks).toEqual([{ type: "p", parts: ["نص."] }]);
  });

  it("returns nothing for empty text", () => {
    expect(parsePostContent(" \n\n ")).toEqual([]);
  });
});

describe("parsePostContent — links to other posts", () => {
  const other = { slug: "marahel", title: "مراحل الزواج في الأردن: من التعارف إلى كتب الكتاب" };

  it("links a mention of the title before its colon, leaving the quote marks outside", () => {
    const blocks = parsePostContent("كما شرحنا في مقال «مراحل الزواج في الأردن».", { otherPosts: [other] });
    expect(blocks).toEqual([
      {
        type: "p",
        parts: ["كما شرحنا في مقال «", { text: "مراحل الزواج في الأردن", slug: "marahel" }, "»."],
      },
    ]);
  });

  it("links a mention of the full title as a whole", () => {
    const blocks = parsePostContent(`اقرأ ${other.title} اليوم.`, { otherPosts: [other] });
    expect(links(blocks)).toEqual([{ text: other.title, slug: "marahel" }]);
  });

  it("links only the first mention of a post", () => {
    const text = "«مراحل الزواج في الأردن» ثم «مراحل الزواج في الأردن».";
    expect(links(parsePostContent(text, { otherPosts: [other] }))).toHaveLength(1);
  });

  it("links a mention inside a list item", () => {
    const blocks = parsePostContent("• راجع «مراحل الزواج في الأردن».\n• بند آخر.", { otherPosts: [other] });
    expect(links(blocks)).toEqual([{ text: "مراحل الزواج في الأردن", slug: "marahel" }]);
  });

  it("does not link inside a longer word", () => {
    const blocks = parsePostContent("هذه مراحل الزواج في الأردنية عادةً.", { otherPosts: [other] });
    expect(links(blocks)).toEqual([]);
  });

  it("ignores a short title part that could match ordinary text", () => {
    const blocks = parsePostContent("الزواج في الأردن جميل.", {
      otherPosts: [{ slug: "z", title: "الزواج: دليل كامل للمقبلين عليه" }],
    });
    expect(links(blocks)).toEqual([]);
  });

  it("does not link titles inside headings", () => {
    const blocks = parsePostContent("مراحل الزواج في الأردن\n\nنص.", { otherPosts: [other] });
    expect(blocks[0]).toEqual({ type: "h2", text: "مراحل الزواج في الأردن" });
  });
});

describe("parsePostContent — the posts in docs/blog", () => {
  it.each(posts.map((p) => [p.slug, p] as const))("%s has sections and keeps every word", (_slug, p) => {
    const blocks = parsePostContent(p.content, { title: p.title, otherPosts: others(p.slug) });
    // Every section in these posts opens after two blank lines; the parser doesn't rely on that, so it checks it
    expect(headings(blocks, "h2")).toHaveLength(p.content.split("\n\n\n").length - 1);
    const stored = p.content.replace(/^\s*[•-]\s+/gm, "").split(/\s+/).filter(Boolean);
    expect(words(blocks)).toEqual(stored);
  });

  it("finds the sections of the fees post, with its cost items one level down", () => {
    const blocks = parsePostContent(post("almahr-fi-alordon").content);
    expect(headings(blocks, "h2")).toEqual([
      "1. كم متوسط المهر في الأردن؟",
      "2. مبادرة المهر النبوي: ما هي؟",
      "3. المهر في القانون الأردني",
      "4. تكاليف الزواج في الأردن بنداً بنداً",
      "كم يكلف الزواج في الأردن إجمالاً؟",
      "5. كيف تخففون تكاليف الزواج؟",
      "ابدأ بمن يشاركك نظرتك",
    ]);
    expect(headings(blocks, "h3")).toHaveLength(7);
  });

  it("puts the numbered questions under their themes", () => {
    const blocks = parsePostContent(post("asilah-qabl-alkhutbah").content);
    expect(headings(blocks, "h2")).toHaveLength(8);
    expect(headings(blocks, "h3")).toHaveLength(12);
  });

  it("puts the seven signs under one section of the sites post", () => {
    const blocks = parsePostContent(post("mawaqe3-zawaj-fi-alordon").content);
    expect(headings(blocks, "h3")).toHaveLength(7);
  });

  it("keeps the verse and the address of the intro post out of its headings", () => {
    const blocks = parsePostContent(post("ta3arraf-ala-naseebak").content);
    expect(headings(blocks, "h2")).not.toContain("naseebak.com");
    expect(headings(blocks, "h2").some((h) => h.includes("﴿"))).toBe(false);
    expect(headings(blocks, "h3")).toHaveLength(7);
  });

  it.each([
    ["almahr-fi-alordon", ["asilah-qabl-alkhutbah"]],
    ["mawaqe3-zawaj-fi-alordon", ["asilah-qabl-alkhutbah", "marahel-alzawaj-fi-alordon"]],
  ])("links the mentions in %s", (slug, expected) => {
    const blocks = parsePostContent(post(slug).content, { title: post(slug).title, otherPosts: others(slug) });
    expect(links(blocks).map((l) => l.slug)).toEqual(expected);
  });

  it("leaves a mention as text when that post is not published", () => {
    const p = post("mawaqe3-zawaj-fi-alordon");
    const blocks = parsePostContent(p.content, { title: p.title, otherPosts: [post("asilah-qabl-alkhutbah")] });
    expect(links(blocks).map((l) => l.slug)).toEqual(["asilah-qabl-alkhutbah"]);
  });
});
