/** Reply quotes (db-free: the website imports it). The snippet is built on the server from the stored, filtered text. */
export const REPLY_SNIPPET_MAX = 80;
/** Same labels as the chat list preview (media.ts IMAGE_PREVIEW / VOICE_PREVIEW) */
export const REPLY_IMAGE_LABEL = "📷 صورة";
export const REPLY_VOICE_LABEL = "🎤 رسالة صوتية";

export type ReplyQuote = { id: string; mine: boolean; kind: "TEXT" | "IMAGE" | "VOICE"; snippet: string };

/** One line of at most REPLY_SNIPPET_MAX characters (an emoji is never cut), or the label of a photo / voice note */
export function replySnippet(m: { kind?: string | null; body: string }): string {
  if (m.kind === "IMAGE") return REPLY_IMAGE_LABEL;
  if (m.kind === "VOICE") return REPLY_VOICE_LABEL;
  const line = m.body.replace(/\s+/g, " ").trim();
  const chars = Array.from(line);
  if (chars.length <= REPLY_SNIPPET_MAX) return line;
  return `${chars.slice(0, REPLY_SNIPPET_MAX - 1).join("").trimEnd()}…`;
}
