/**
 * Users handed to autoSuggestForUser per run (sequential, most recently active first; the rest are picked up the next
 * day or lazily). 150 until 2026-11-07, when it left 129 of 279 active members un-topped-up, and their hidden cards
 * unrevealed, every morning. About 0.14 s each on production, so 600 stays well inside the 5-minute request.
 * Db-free, so the admin page (a client component) reads the same number as the morning job and «Generate All».
 */
export const WEEKLY_SUGGEST_LIMIT = 600;
