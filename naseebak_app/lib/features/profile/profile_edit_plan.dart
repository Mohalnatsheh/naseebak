/// Which edited profile fields save where — the app's copy of the web's `splitProfileEdit()`
/// (src/lib/profile-edit-split.ts) and the server rule in `reviewedChanges()` (profile-review.ts):
/// - `fills`: fields still empty on the server → saved at once by `PUT /api/profile`
/// - `reviewed`: changes to (or clearing of) a stored value → a review request for the Naseebak team
///
/// Partner preferences have their own screen and never come through here.
class ProfileEditPlan {
  const ProfileEditPlan({required this.fills, required this.reviewed});
  final Map<String, Object?> fills;
  final Map<String, Object?> reviewed;

  bool get isEmpty => fills.isEmpty && reviewed.isEmpty;
}

/// Same rule as the server: null, "" or an empty list. `false` and `0` are answers.
bool isEmptyStored(Object? v) => v == null || v == '' || (v is List && v.isEmpty);

/// A stored birth date (ISO date-time) as the `YYYY-MM-DD` the forms send.
String? dayOf(Object? v) => v is String && v.length >= 10 ? v.substring(0, 10) : (v is String ? v : null);

bool _same(Object? a, Object? b) {
  if (isEmptyStored(a) && isEmptyStored(b)) return true;
  if (a is num && b is num) return a == b;
  return a == b;
}

/// Compares the edited values with the stored profile; only the changed keys are planned.
ProfileEditPlan planProfileEdit(Map<String, Object?> stored, Map<String, Object?> edited) {
  final fills = <String, Object?>{};
  final reviewed = <String, Object?>{};
  for (final e in edited.entries) {
    final before = e.key == 'dateOfBirth' ? dayOf(stored[e.key]) : stored[e.key];
    if (_same(before, e.value)) continue;
    if (isEmptyStored(before) && !isEmptyStored(e.value)) {
      fills[e.key] = e.value;
    } else {
      reviewed[e.key] = isEmptyStored(e.value) ? null : e.value;
    }
  }
  return ProfileEditPlan(fills: fills, reviewed: reviewed);
}

/// «الحجاب» is one answer stored in two fields (`hijab` + `niqab`, server invariant: niqab ⇒ hijab). When one of
/// them goes to review, the other changed one goes with it, so a direct save of `niqab` can never flip a reviewed
/// `hijab` early (or show a half-applied answer).
ProfileEditPlan keepHijabPairTogether(ProfileEditPlan plan) {
  const pair = {'hijab', 'niqab'};
  if (!plan.reviewed.keys.any(pair.contains)) return plan;
  final fills = {...plan.fills};
  final reviewed = {...plan.reviewed};
  for (final k in pair) {
    if (fills.containsKey(k)) reviewed[k] = fills.remove(k);
  }
  return ProfileEditPlan(fills: fills, reviewed: reviewed);
}
