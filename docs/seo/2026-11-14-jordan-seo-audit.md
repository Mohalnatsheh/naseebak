# Jordan SEO audit and keyword plan (2026-11-14)

Scope: naseebak.com (Jordan, the root), checked live on 2026-11-14 as Googlebot, plus the code on `main`.

## 1. What is already right (keep it)

- `<title>` and description carry the main phrase: «منصة زواج بالحلال في الأردن».
- Canonical on every page, hreflang ar-JO / ar-SA / ar-LB + x-default, `lang="ar-JO"`, `dir="rtl"`.
- `robots.txt` blocks only private areas. Sitemap is rebuilt hourly with blog `lastmod`.
- Structured data: Organization, WebSite, FAQPage (home and /faq), BlogPosting + BreadcrumbList on posts.
- Open Graph and Twitter cards with a 1200×630 image. `www` and `http` 301 to `https://naseebak.com`.
- Server-rendered HTML (the content is in the page source, not only in JavaScript). TTFB ≈ 0.6 s.
- `/llms.txt` for AI assistants.

## 2. Gaps found

| # | Gap | Impact | Status |
|---|---|---|---|
| 1 | Home H1 was the slogan «يمكن نصيبك أقرب مما تتوقع»: no keyword in the page's main heading | High | **Fixed** (branch `feature/seo-landing-jo`) |
| 2 | The home page linked to no article. Guides were reachable only through /blog and the sitemap | High | **Fixed**: «أدلة ونصائح للزواج» block, 3 newest posts of the country |
| 3 | Only **5 Jordanian posts**. ~780 words on the home page. Too little content to rank for many keywords | **Highest** | Content plan below (section 4) |
| 4 | No page answers city intent («زواج في عمان», «إربد», «الزرقاء») | High | Plan below, needs an owner decision (section 5) |
| 5 | The Android app is not described as an entity («تطبيق زواج») | Medium | **Fixed**: `MobileApplication` JSON-LD on the home page |
| 6 | /blog shows ~350 words, /about ~385: thin | Medium | Expand /about (story, team, how members are protected) |
| 7 | Posts have the organisation as author; no named person or reviewer | Medium (E-E-A-T on a marriage topic) | Add a named author/reviewer (e.g. a family counsellor or sharia advisor) once the owner has one |
| 8 | `/login` and `/register` are indexable pages with ~45 words | Low | Keep for now (people search «نصيبك تسجيل دخول»); revisit in Search Console |
| 9 | `meta keywords` is ignored by Google | None | Harmless, left as is |
| 10 | No backlinks plan: the domain is young (2025) | **High** | Section 6 |

Not measured: Core Web Vitals (the PageSpeed API quota was used up). Check in Search Console → Core Web Vitals and
https://pagespeed.web.dev/ for `/` on mobile. The hero phone image is `priority` and has `sizes`, so LCP should be fine.

## 3. What changed in code (branch `feature/seo-landing-jo`)

- `src/components/landing/hero.tsx`: the eyebrow pill now sits inside the `<h1>`; same look. The H1 reads
  «منصة زواج بالحلال في الأردن — يمكن نصيبك أقرب مما تتوقع». Saudi and Lebanese eyebrows are unchanged text.
- `src/components/landing/content.ts`: Jordan's eyebrow «منصة زواج أردنية» → «منصة زواج بالحلال في الأردن».
- `src/components/landing/articles.tsx` (new) + `src/app/(ar)/page.tsx`: the country's 3 newest posts before the
  final call to action, with a link to /blog. Hidden when a country has no post. Same for /sa and /lb.
- `src/app/(ar)/page.tsx`: `MobileApplication` JSON-LD from the Play Store link in mobile config.
- No schema change, no switch needed (copy and links only), no app version needed.

## 4. Keyword map (Jordan)

Volumes are not stated here: confirm them in Google Keyword Planner (Jordan, Arabic) and in Search Console once the
pages are live. Grouped by intent, with the page that should rank.

### A. Money keywords (people looking for a service): home page and city pages

| Keyword cluster | Target page |
|---|---|
| موقع زواج في الأردن · موقع زواج أردني · موقع زواج اردني موثوق · أفضل موقع زواج في الأردن | `/` |
| زواج بالحلال الأردن · تعارف بقصد الزواج الأردن · زواج إسلامي الأردن | `/` |
| تطبيق زواج أردني · تطبيق زواج بالحلال · برنامج زواج | `/` (+ Play listing title/description) |
| خطابة في الأردن · خاطبة في عمان · رقم خطابة · خطابة الكترونية | new post + city pages |
| زواج في عمان · زواج في إربد · زواج في الزرقاء · زواج في السلط · زواج في العقبة | city pages (section 5) |
| ابحث عن زوجة في الأردن · ابحث عن زوج أردني · عروس أردنية | `/` + posts |

### B. Information keywords (the blog): build topical authority, link each post to `/`

Existing: المهر في الأردن · مراحل الزواج في الأردن · أسئلة قبل الخطوبة · مواقع الزواج في الأردن · تعرّف على نصيبك.

Next posts, in this order (one or two a week):

1. **أوراق ومعاملات الزواج في الأردن 2026** (عقد الزواج في المحكمة الشرعية، الفحص الطبي، الرسوم): strong, recurring searches.
2. **الفحص الطبي قبل الزواج في الأردن**: أين، كم يكلف، ماذا يشمل.
3. **تكاليف الزواج في الأردن 2026**: قاعة، ذهب، جاهة، شقة (link to the مهر post).
4. **الجاهة الأردنية: كيف تُرتَّب وماذا يُقال**: very Jordanian, little good content exists.
5. **الخطابة في الأردن: هل ما زالت الطريقة الأفضل؟** (and the online alternative): takes the «خطابة» searches.
6. **كيف تطلب يد فتاة من أهلها في الأردن** (خطوة بخطوة).
7. **الرؤية الشرعية: حدودها وآدابها**.
8. **شروط الزواج في القانون الأردني** (السن، الولي، الشهود): cite the law, update yearly.
9. **زواج المطلقة والأرملة في الأردن**: underserved and respectful; ties to members who are divorced/widowed.
10. **فترة الخطوبة: كم تطول وكيف تنجح**.
11. **صفات الزوجة الصالحة / الزوج الصالح**: high-volume evergreen; frame around compatibility.
12. **كيف تعرف أن الشريك مناسب لك**: links to the 12-questions post.
13. **الزواج في رمضان والأعياد: مواعيد الأعراس في الأردن**: seasonal, publish 6 weeks before.
14. **مقارنة: مواقع الزواج وتطبيقات التعارف، ما الفرق؟**: positions «ليس تطبيق تعارف».
15. **قصص زواج من نصيبك** (with written consent, no faces): once there are some.

Rules for each post: 1,200+ words, the keyword in the title, first paragraph and one H2; a short answer in the first
two lines (for featured snippets and AI answers); a FAQ block at the end; 2–3 links to other posts and one to `/`;
the year in the title only when the facts change yearly; update `updatedAt` when facts change.

## 5. City pages (needs an owner decision before building)

Proposal: `/zawaj/amman`, `/zawaj/irbid`, `/zawaj/zarqa` (then السلط، العقبة، مادبا، الكرك، المفرق).
Each page must be genuinely different, or Google treats them as doorway pages: the members in that city
(a count, only above a minimum, like the home stats), local customs (جاهة، مهر in that area), courts for the marriage
contract in that city, and real questions. Built as server pages with their own title, canonical, sitemap entry and
BreadcrumbList. Matching stays country-wide: the copy must not promise local-only matches.

This is a new feature and goes through `superpowers:brainstorming` first (CLAUDE.md).

## 6. Off-page (backlinks and brand): the biggest lever after content

- **Google Business Profile** for Naseebak (Amman, service-area business): brand searches and maps.
- **Search Console**: confirm the domain property is verified, submit the sitemap, watch «Pages» and «Performance».
  Also **Bing Webmaster Tools** (feeds ChatGPT/Copilot search).
- Jordanian press: a launch or data story (e.g. «متوسط عمر الزواج بين أعضاء نصيبك») to Roya, Al Ghad, Ammon,
  JO24, Khaberni, Sayidaty. One real news link beats many directory links.
- Wedding suppliers (halls, photographers, jewellers, dress shops in Amman): link partnerships or guest posts.
- Instagram/TikTok/YouTube bios link to the site; YouTube videos with Arabic titles on the same topics as the posts.
- Avoid bought links and link farms: one penalty costs more than a year of content.

## 7. Measure

- Search Console, Jordan filter: impressions and clicks for «موقع زواج», «زواج في الأردن», «خطابة», brand.
- Baseline now; review on 2026-12-14 and 2027-02-14.
- GA4: organic sessions → sign-ups (the start form already records the place `hero` / `final`).
