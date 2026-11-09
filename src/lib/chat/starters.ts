/**
 * Conversation starters (db-free: the website imports it, the app gets them from GET /api/chats/[id] → `starters`).
 * Shown while I haven't written anything yet. Respectful, about values and plans, never contact; a chosen starter
 * is sent like any message, through the filter. The partner is the opposite gender of the viewer, so the viewer's
 * gender decides both sides: who is addressed («تبحثين») and whom they look for («شريك حياتك»).
 */
import { forPartner } from "@/lib/gendered-copy";

export function chatStarters(viewerGender: string | null | undefined): string[] {
  const p = (masculine: string, feminine: string) => forPartner(viewerGender, masculine, feminine);
  return [
    // Addressed to the partner, about the partner's own future spouse (the viewer's gender)
    p("ما الذي تبحث عنه في شريكة حياتك؟", "ما الذي تبحثين عنه في شريك حياتك؟"),
    p("كيف تحب أن تقضي يوم الجمعة؟", "كيف تحبين أن تقضي يوم الجمعة؟"),
    p("ما أهم شيء في العائلة بالنسبة لك؟", "ما أهم شيء في العائلة بالنسبة لكِ؟"),
    p("ما خططك للسنوات القادمة؟", "ما خططكِ للسنوات القادمة؟"),
  ];
}
