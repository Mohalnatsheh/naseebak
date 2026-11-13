# «الديانة» (religion) field

Date: 2026-11-13. Status: approved by the owner (2026-11-13).

## Intent

Today every member is implicitly Muslim: the profile asks about hijab, beard and «الالتزام الديني», and Lebanon asks
«المذهب» (سني / شيعي). Christians in Jordan, Lebanon and Saudi Arabia cannot describe themselves honestly, and they
can't look for a Christian partner. The owner wants a «الديانة» question, مسلم or مسيحي, in all three countries, so
Christian members can join and be matched properly.

## Owner decisions (2026-11-13)

- **All three countries.** «الديانة» is asked in Jordan, Saudi Arabia and Lebanon.
- **The member chooses who they meet.** A partner preference «الديانة» has two answers:
  - «نفس ديانتي» (the default);
  - «لا مانع».

  A pair of different religions is suggested only when both members chose «لا مانع».
- **Any mixed pair is allowed**, whatever the genders.
  - The owner was told that in Jordan and Saudi Arabia a Muslim woman can't legally marry a Christian man.
  - The owner was also told that a traditional platform suggesting that pair may upset families.
  - The owner chose to allow it anyway. Don't "correct" this rule.
- **Existing members count as مسلم.** About 2,000 members joined before this field. Nobody is asked; a Christian
  member changes it in their profile.
- **Christians skip the Muslim-specific questions.** For a Christian member:
  - hijab/niqab, beard and «المذهب» (Lebanon) are not asked and never shown on their card or profile;
  - «الالتزام الديني» stays, with its stored values unchanged.
- **Where others see it:**
  - always in the full profile;
  - on the suggestion card only when the two members' religions differ.
- **Rollout:** the website goes behind a switch (`religion_enabled`, Admin → Settings, off by default). The app
  follows in its next version.

## Goals

- A Christian member can sign up, describe themselves without Muslim-only questions, and get suggestions.
- A member who wants only their own religion never sees the other religion.
- A mixed pair appears only when both sides opened to it, and the card says so plainly.
- With the switch off, nothing changes for anyone.

## Non-goals

- **Denominations** (أرثوذكس، كاثوليك …), church attendance and other Christian-specific questions.
- **Religions beyond مسلم / مسيحي.**
- **Public copy and SEO.** The site uses «الزواج بالحلال» and the keyword «زواج إسلامي»
  (`src/lib/public-copy.ts`, the FAQ, `about`, `layout.tsx` structured data). It is not changed here. The owner is
  told it may put off Christian visitors, and decides separately.
- **The app version itself.** It gets its own plan after the queued app releases.

## Anti-goals

- A Muslim member who never touched the new preference must never get a Christian suggestion, and the other way
  round.
- A Christian member's profile must never show an empty hijab or beard line, a sect, or a question that assumes
  Islam.
- Christian–Christian pairs must reach suggestions as easily as Muslim pairs. The score must not punish them for the
  questions they skipped.
- An old app must not break, and must not be able to put a Muslim-only answer on a Christian profile.

## Data (additive)

- `Profile.religion String?`, with values `"مسلم"` and `"مسيحي"`. Null reads as `"مسلم"` everywhere, so existing
  members need no backfill. *(Designer's call: no data migration on a live database.)*
- `Profile.prefReligion String?`, with values `"نفس ديانتي"` and `"لا مانع"`. Null reads as `"نفس ديانتي"`.
- Stored values never change (CLAUDE.md). Shown labels go through `selfLabel` / `describeOption` / `partnerOptions` as
  for other fields. Gender forms are needed only if the wording needs them; «مسلمة» / «مسيحية» are used for a woman.
- A new db-free helper `src/lib/profile-religion.ts`, modelled on `src/lib/profile-sect.ts`, holds:
  - the value lists, plus `religionOf(profile)` (null → «مسلم») and `opensToOtherReligion(profile)`;
  - `religionsMatch(a, b)`: same religion, or both `"لا مانع"`;
  - `stripMuslimOnlyForChristian(religion, data)`: drops these from a write by or about a Christian member:
    - `hijab`, `niqab`, `beard`, `sect`, `prefSect`, `prefHijab`, `prefBeard`;
    - the dealbreaker keys `hijab`, `beard`, `sect`.

    A Christian is never asked what veil or beard they want in a partner. *(Designer's call, following "hide the
    Muslim-specific questions".)*
- **Switching to «مسيحي» erases the old answers.** When a member's religion becomes «مسيحي» (at setup, or when the
  team approves the change), these stored values are cleared in the same write: `hijab`, `niqab`, `beard`, `sect`,
  `prefSect`, `prefHijab`, `prefBeard`, and those dealbreaker keys. A member switching back answers them again.
  *(Owner, 2026-11-13.)*

## Rules

- **Matching (hard rule).** `religionsMatch` joins `mutuallyAcceptable` in `src/lib/matching/score.ts`. Both
  generators, the admin generate route's pair loop and the manual pair check (`src/lib/admin/suggestion-pair.ts`) use
  that one check. `memberSuggestStatus` follows automatically, because it calls `mutuallyAcceptable`, so the "must
  mirror generate" rule holds. It applies whatever the switch says (see "The switch and matching" below).
- **Score.** Hijab, beard and sect items are skipped, not counted as a mismatch, when the person they describe is
  Christian, and their weight leaves the total. «الالتزام الديني» scores as today.
  - A test must show that two otherwise-compatible Christian profiles score at least the minimum (60).
  - A second test must show a Christian–Muslim pair (both «لا مانع») isn't scored down for the Christian's skipped
    questions.
- **Dealbreakers («شروط أساسية»).**
  - A Christian member has no hijab, beard or sect keys (stripped).
  - A Muslim member who keeps a hijab or beard dealbreaker and opens to «لا مانع» will, as today, exclude anyone
    without that answer, Christians included. That is the dealbreaker doing its job. Show it in the preference
    screen's hint: «شروطك الأساسية مثل الحجاب تبقى سارية».
- **Changing religion or preference.** It is treated like any other preference or data change:
  - unanswered cards that no longer fit close (`closedByChange`);
  - cards anyone said «مهتم» on stay open (owner rule 2026-11-07);
  - the suggest cooldown clears.
- **Review.**
  - «الديانة» itself is profile data: after setup, a change goes through the existing review (`update-request`), as
    other fields do.
  - The preference is a partner preference, so no review.
  - For an existing member, null counts as «مسلم», not as empty. The edit page shows «مسلم» selected, and changing it
    to «مسيحي» is a change that goes through review. It is not "filling an empty field". A new member answers it
    freely at setup. *(Designer's call: nobody enters the other religion's pool without the team seeing it.)*
- **Completeness.** «الديانة» doesn't count toward the completeness percentage or the missing-field tips, because null
  is a valid answer (مسلم). Existing members see no new nudge. *(Designer's call.)*
- **The switch and matching.** `religion_enabled` gates asking, showing and storing. The matching rule
  (`religionsMatch`) always applies to whatever is stored. Before anyone sets «مسيحي» it changes nothing, since every
  null reads as مسلم. After a rollback it keeps members who chose «نفس ديانتي» away from the other religion.
  *(Designer's call: the anti-goal must hold even if the switch is turned off later.)*
- **Hint placement.** The «شروطك الأساسية مثل الحجاب تبقى سارية» line shows under «لا مانع» in the preference
  screen, and only for a Muslim member who has a hijab or beard «شرط أساسي».

## Where it appears (website)

- **Setup wizard** (`src/app/(ar)/dashboard/profile/setup/page.tsx`): «الديانة» is asked in step 1 or 2, required,
  with no preselected answer. Choosing «مسيحي» hides hijab/niqab, beard and «المذهب» at once. The server never
  requires the field, because old apps don't send it.
- **Edit page** (`…/profile/edit/page.tsx`): the same fields and the same hiding.
- **Partner preferences:** «الديانة» with «نفس ديانتي» / «لا مانع», and a one-line hint for «لا مانع»: «ستظهر لك
  اقتراحات من الديانة الأخرى ممن اختاروا ذلك أيضاً».
- **Own profile page:** shows «الديانة» and the preference.
- **Cards** (`candidate-details.tsx`, `matches-view.tsx`, `mutual-suggestions-view.tsx`, the suggestions page):
  «مسيحي» / «مسلمة» etc. appear as a fact only when the two religions differ. The full profile always shows it.
- **Admin:** the user page shows «الديانة» and the preference. The profile-requests page lists it. The members
  suggest-reason gives «الديانة» as a reason when it is what blocks a pair.
- **Server:** every write path calls `stripMuslimOnlyForChristian`:
  - `profile/route.ts`, `profile/draft/route.ts`, `profile/update-request/route.ts`, `profile/dealbreakers/route.ts`;
  - admin approval in `src/lib/admin/profile-changes.ts`.

  `applyNiqabRule` still runs for Muslims. With the switch off, `religion` and `prefReligion` are dropped from every
  write, like `sect` outside Lebanon.
- **Options to the app** (`src/lib/countries/settings.ts`): `religion` and `prefReligion` lists are sent only while
  the switch is on. Old apps ignore them, and the new app shows the question when the list is present (the same
  trick as `sect`).

## Constraints

- **Switch:** `religion_enabled`, Admin → Settings, default off. Off means nothing is asked, shown or stored. The
  matching rule still applies to stored values, which before launch are all null (مسلم), so off = today exactly.
- **Schema:** additive only (two nullable columns), with `db:push` checked with `migrate diff` before deploy.
- **Client code:** client wizards import only the db-free helper.
- **Gendered copy:** gendered labels via `selfLabel` / `describeOption`.
- **Guard tests:** a guard test, like the Lebanese one, so a new profile write path can't skip
  `stripMuslimOnlyForChristian`.
- **Mirroring:** `memberSuggestStatus` must keep mirroring `generate` (CLAUDE.md).
- **Deploy:** ask the owner before deploying, and before turning the switch on.

## Approaches considered

1. **A hard rule in the shared pair check (chosen).** One function in `mutuallyAcceptable` covers every generator, the
   admin tools and the status page.
2. **A database `where` on religion in each candidate query.** Rejected: five or six queries to keep in sync
   (`auto-suggest.ts`, `members-suggest-reason.ts`, `filter-tip.ts`, two admin routes, `suggestion-pair.ts`), and
   null-as-مسلم makes the SQL awkward. The country filter is a hard `where` because it never changes; religion
   preferences do.
3. **A «شرط أساسي» key only.** Rejected: dealbreakers are opt-in, so a Muslim who never set one would get Christian
   cards. That breaks the anti-goal.

## Left to the builder

- Exact step placement in the setup wizard, and the wording of the hints, within the rules above.
- Whether the Muslim-only items' weight is removed by skipping or by renormalising, as long as the two score tests
  pass.
- The admin label texts (English).

## App (next version, separate plan)

- **Same as the website:** the setup and edit question, hiding the Muslim-only questions for «مسيحي», the preference,
  and the profile and card display.
- **Driven by the server's option lists**, so turning the switch off hides it in the app too.
- **Until the app ships:** app members can't set «مسيحي» (they stay مسلم), but can on the website.
