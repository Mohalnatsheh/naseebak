/**
 * Reads a post's stored plain text into blocks the blog page renders as real headings, lists and links.
 * The text stays as it is in `blog_posts` (the app shows it plain); nothing here is written back.
 * Shape of a post: blocks separated by blank lines. A short line alone is a section title; a short first
 * line directly above text is a title one level down; lines starting with • or - are a list.
 */

export type PostLink = { text: string; slug: string };
/** Text with links: plain strings and, between them, mentions of other posts */
export type PostInline = (string | PostLink)[];

export type PostBlock =
  | { type: "h2" | "h3"; text: string }
  | { type: "p"; parts: PostInline }
  | { type: "ul"; items: PostInline[] };

type PostRef = { slug: string; title: string };

const MAX_TITLE_LENGTH = 80;
/** The part of a title before its colon counts as a name from this length; shorter ones match ordinary text */
const MIN_NAME_WORDS = 3;

const LIST_MARK = /^[•-]\s+/;
/** Ends like a sentence or a line introducing a list, also just before a closing quote */
const SENTENCE_END = /[.!،,:؛;…]["»)]*$/;
const ARABIC_LETTER = /\p{Script=Arabic}/u;

function isTitleLine(line: string): boolean {
  return (
    line.length <= MAX_TITLE_LENGTH &&
    !SENTENCE_END.test(line) &&
    !LIST_MARK.test(line) &&
    !line.startsWith("﴿") &&
    ARABIC_LETTER.test(line) // not a web address
  );
}

/** A whole-word matcher for each post's title and the part before its colon, longest first, or null with no posts */
function titleMatcher(posts: PostRef[]) {
  const slugs = new Map<string, string>();
  for (const { slug, title } of posts) {
    const short = title.split(":")[0].trim();
    if (short.split(/\s+/).length >= MIN_NAME_WORDS && !slugs.has(short)) slugs.set(short, slug);
    if (!slugs.has(title)) slugs.set(title, slug);
  }
  if (slugs.size === 0) return null;

  const names = [...slugs.keys()].sort((a, b) => b.length - a.length);
  const pattern = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return { slugs, regex: new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${pattern})(?![\\p{L}\\p{M}\\p{N}])`, "gu") };
}

export function parsePostContent(
  content: string,
  { title, otherPosts = [] }: { title?: string; otherPosts?: PostRef[] } = {}
): PostBlock[] {
  const matcher = titleMatcher(otherPosts);
  const linked = new Set<string>();

  /** Only a post's first mention becomes a link */
  const inline = (text: string): PostInline => {
    if (!matcher) return [text];
    const parts: PostInline = [];
    let last = 0;
    for (const match of text.matchAll(matcher.regex)) {
      const slug = matcher.slugs.get(match[0])!;
      if (linked.has(slug)) continue;
      linked.add(slug);
      if (match.index > last) parts.push(text.slice(last, match.index));
      parts.push({ text: match[0], slug });
      last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  const chunks = content
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);

  if (chunks[0]?.length === 1 && chunks[0][0] === title) chunks.shift();

  const blocks: PostBlock[] = [];
  chunks.forEach((lines, index) => {
    let rest = lines;
    if (isTitleLine(lines[0])) {
      if (lines.length > 1) {
        blocks.push({ type: "h3", text: lines[0] });
        rest = lines.slice(1);
      } else if (index < chunks.length - 1) {
        blocks.push({ type: "h2", text: lines[0] });
        return;
      }
    }

    let text: string[] = [];
    let items: PostInline[] = [];
    const flush = () => {
      if (text.length > 0) blocks.push({ type: "p", parts: inline(text.join("\n")) });
      if (items.length > 0) blocks.push({ type: "ul", items });
      text = [];
      items = [];
    };
    for (const line of rest) {
      if (LIST_MARK.test(line)) {
        if (text.length > 0) flush();
        items.push(inline(line.replace(LIST_MARK, "")));
      } else {
        if (items.length > 0) flush();
        text.push(line);
      }
    }
    flush();
  });
  return blocks;
}
