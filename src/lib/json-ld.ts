/**
 * JSON for a `<script type="application/ld+json">` body (QA ADM-03, 2026-11-11). Plain `JSON.stringify` leaves `<`
 * as is, so a stored value such as a blog title containing `</script>` would close the tag and run as markup.
 * Escaping `<`, `>`, `&` and the two JS line separators as \u sequences keeps the JSON identical for parsers.
 */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
