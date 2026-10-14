---
name: naseebak-marketing
description: Naseebak (نصيبك) marketing studio. Use for any marketing or social media request for the Naseebak brand — Instagram posts, carousels, Reels, Stories, campaigns, content calendars, image or video concepts, captions, hooks, Arabic copy, competitor or trend analysis, content review, or performance analysis. Triggers include "create content", "create weekly content", "create campaign", "create reel", "create carousel", "create post", "create story", "content calendar", "analyze performance", "review content", "viral reel", "generate hooks", "test hooks", "retention check", "edit reel", "analyze trends", "Higgsfield", "Runway".
---

# Naseebak Marketing Studio

The full system lives in `Marketing/`. Do not improvise marketing from scratch — follow it.

1. Read `Marketing/MARKETING_SYSTEM.md` and the command list in `Marketing/README.md`.
2. Load brand truth: `Marketing/brand/BRAND_DNA.md`, `DO_AND_DONT.md`, `BRAND_VOICE.md`, `VISUAL_IDENTITY.md`, `AUDIENCE.md`, `PRODUCTS_SERVICES.md`.
3. Route the request with `Marketing/prompts/MASTER_CONTENT_PROMPT.md` to the matching prompt and skills in `Marketing/skills/`.
4. Scan `Marketing/content/` to avoid repeating hooks, concepts, visuals and CTAs.
5. Run `Marketing/skills/quality-control.md`; iterate until overall ≥ 8/10.
6. Save to `Marketing/content/...` and renders to `Marketing/assets/generated/` (render with `node Marketing/studio/render.mjs`).
7. For any Reel, run the Viral Reel Engine in `Marketing/MARKETING_SYSTEM.md` §12 (start with `Marketing/skills/viral-reel-director.md`). Use Higgsfield/Runway per §12.7 routing; preflight costs and ask the user before spending credits (§12.8); never use publishing or AI-influencer tools (§12.9).
8. Stop at status REVIEW and present to the user. Never publish without explicit approval. Never invent facts; mark `[NEEDS INPUT]`.
