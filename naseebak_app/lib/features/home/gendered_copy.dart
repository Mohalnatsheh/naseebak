/// Small gender-aware phrases (the website's src/lib/gendered-copy.ts). `viewerFemale` is the signed-in member;
/// the other person is always the opposite gender.
library;

/// The form addressed to the viewer ("أكمل" / "أكملي").
String forViewer(bool viewerFemale, String masculine, String feminine) => viewerFemale ? feminine : masculine;

/// The form that refers to the other person (a man when the viewer is a woman).
String forPartner(bool viewerFemale, String masculine, String feminine) => viewerFemale ? masculine : feminine;

/// "Block X?" confirmation body: neither of you will see the other again.
String blockConfirmText(bool viewerFemale) =>
    viewerFemale ? 'لن يظهر لكِ ولن تظهري له مرة أخرى.' : 'لن تظهر لك ولن تظهر لها مرة أخرى.';

/// Report-and-block body.
String reportBlockText(bool viewerFemale) => viewerFemale
    ? 'يراجع فريق نصيبك البلاغ، ويُحظر الطرف الآخر فلا يظهر لكِ ولا تظهرين له مرة أخرى.'
    : 'يراجع فريق نصيبك البلاغ، ويُحظر الطرف الآخر فلا تظهر لك ولا تظهر لها مرة أخرى.';

/// The link under a disabled «مهتم» at 0 credits.
String rechargeToContinue(bool viewerFemale) => viewerFemale ? 'اشحني رصيدك للمتابعة' : 'اشحن رصيدك للمتابعة';
