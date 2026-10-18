/**
 * Small gender-aware phrases shared by dashboard screens (pure, no db import: safe in client components).
 * `viewerGender` is the signed-in member's gender; the other person is always the opposite gender.
 */

const isFemale = (g: string | null | undefined) => (g ?? "").toUpperCase() === "FEMALE";

/** Pick the masculine or feminine form for the viewer ("أكمل" / "أكملي"). */
export function forViewer(viewerGender: string | null | undefined, masculine: string, feminine: string) {
  return isFemale(viewerGender) ? feminine : masculine;
}

/** Pick the form that refers to the other person (a man when the viewer is a woman). */
export function forPartner(viewerGender: string | null | undefined, masculine: string, feminine: string) {
  return isFemale(viewerGender) ? masculine : feminine;
}

/** "Block X?" confirmation body: neither of you will see the other again. */
export function blockConfirmText(viewerGender: string | null | undefined) {
  return isFemale(viewerGender)
    ? "لن يظهر لكِ ولن تظهري له مرة أخرى."
    : "لن تظهر لك ولن تظهر لها مرة أخرى.";
}

/** Report-and-block dialog body. */
export function reportBlockText(viewerGender: string | null | undefined) {
  return isFemale(viewerGender)
    ? "يراجع فريق نصيبك البلاغ، ويُحظر الطرف الآخر فلا يظهر لكِ ولا تظهرين له مرة أخرى."
    : "يراجع فريق نصيبك البلاغ، ويُحظر الطرف الآخر فلا تظهر لك ولا تظهر لها مرة أخرى.";
}
