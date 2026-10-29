# Multi-country platform (Jordan + Saudi Arabia) — design

Owner request 2026-10-26: one platform for many countries. Each country has its own landing page, SMS provider, wording on the landing page and the member dashboard; the admin panel picks a country to manage; visitors see the Jordan flag by default and can switch to Saudi Arabia at any time; members only see people from their own country (cross-country later, as a switch). Built locally, tested, then published. Live site with real users → **additive and switch-safe: every existing member is Jordan and nothing changes for them.**

Saudi wording, cities, phone rules, SAR packages and Saudi legal text come from the reviewed `naseebak-ksa` copy (branch `ksa`).

## Decisions

| Topic | Decision |
|---|---|
| Countries | Code-level registry `src/lib/countries/` (db-free, client-safe): `JO`, `SA`. Adding a country = one config file + its copy/legal files. |
| Member's country | New column `User.country` (`String @default("JO")`, indexed with gender). Set at registration **from the phone number** (962… → JO, 966… → SA) and fixed — an account's country follows its phone. Existing rows = JO. |
| Visitor's country | Cookie `naseeb_country` (`JO`/`SA`, 1 year). Set by the flag switcher in the navbar, or by `?country=sa|jo` on any public URL (for ads). Default: geo header if present (`cf-ipcountry` / `x-country-code` that Nginx can add later), else `JO`. |
| Matching | Suggestions (automatic top-up, admin generate, hand-pick check, refresh/sweeps) only pair members of the same `country`. A future system setting `cross_country_matching` (off) will lift this. Existing rows/matches are untouched. |
| Phones | Per-country rules (regex, normalise, format, placeholder, dial code). `normalizePhone(input, country?)` accepts both; registration/login show a dial-code switch (🇯🇴 +962 / 🇸🇦 +966) preselected from the visitor cookie. Guardian phone must be from the member's country. Chat filter blocks both formats. |
| SMS | `sendSms()` routes by the phone's country: JO → Broadnet (unchanged), SA → Unifonic adapter (env `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID`). A country without a configured provider fails like today's SMS failure (send-otp 502); test numbers keep the fixed code. |
| Money | Packages per country: JO = current opening offer (JOD shown, USD charged — unchanged); SA = `sa_10` 15 ر.س · `sa_25` 30 · `sa_50` 50, charged in SAR (prices `[NEEDS INPUT]`, no "was" price). Checkout only sells the member's country packages; currency stored on `Payment`. |
| Copy | Landing content, FAQ, about, contact, terms, privacy, refund policy per country (`JO` = today's text; `SA` from naseebak-ksa, legal paragraphs marked `[NEEDS LEGAL REVIEW: KSA]`). Dashboard wording via a small per-country dictionary (هاتف/جوال, العشيرة/القبيلة, currency, nationality default, cities). |
| Dates | Per-country locale/time zone: JO `ar-JO-u-nu-latn` / Asia/Amman, SA `ar-SA-u-ca-gregory-nu-latn` / Asia/Riyadh (never plain `ar-SA` — Hijri). Both UTC+3, so server "Amman day" helpers stay valid. |
| Admin | Country selector at the top of the admin panel (cookie `admin_country`, `JO` default, plus `ALL` for totals). Every admin list/stat API filters by it (users, suggestions, matches, chats, introductions, payments, reports, blocks, support, contact messages, profile requests, identity, visits, deletions, notifications, dashboard stats). Settings/switches stay global for now. |
| Flag | Navbar shows the current country's flag + name; Saudi flag shown as the 🇸🇦 emoji only (the Saudi flag carries the Shahada — commercial/graphic use is restricted, owner to confirm). |
| Out of scope (later) | Per-country blog, per-country switches, cross-country matching, separate Stripe accounts, separate domains. |

## Open inputs (owner)
Saudi SMS provider + sender ID registration (CST) · SAR prices · Saudi legal review + operator details (CR/VAT/statement name) · flag usage · whether ads use `?country=sa` links.

## Plan
1. Foundation: country registry, `User.country`, phone rules per country, cookie/visitor helpers, per-country SMS router, packages per country, locale helpers. Tests.
2. Matching same-country everywhere candidates are chosen; admin hand-pick refuses cross-country.
3. Public: flag switcher, per-country landing/FAQ/legal/about/contact, register/login dial-code switch.
4. Dashboard: per-country cities, wording, payments, dates.
5. Admin: country selector + filters on every list/stat route.
6. Seed both countries locally, full test run, build, click-through both countries as a visitor, member and admin. Then publish with `--db-push` (additive column) after owner approval.
