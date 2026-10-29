/// Small, forgiving readers for JSON maps (the backend is the source of truth; the app never crashes on
/// a missing optional field).
library;

String? asString(Object? v) => v is String ? v : v?.toString();

String asStringOr(Object? v, [String fallback = '']) => asString(v) ?? fallback;

int? asInt(Object? v) {
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v) ?? double.tryParse(v)?.round();
  return null;
}

double? asDouble(Object? v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

bool? asBool(Object? v) => v is bool ? v : null;

DateTime? asDate(Object? v) => v is String ? DateTime.tryParse(v) : null;

Map<String, dynamic> asMap(Object? v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

Map<String, dynamic>? asMapOrNull(Object? v) => v is Map ? Map<String, dynamic>.from(v) : null;

List<Map<String, dynamic>> asMapList(Object? v) =>
    v is List ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : const [];

List<String> asStringList(Object? v) => v is List ? v.whereType<String>().toList() : const [];

/// `{ page, total, totalPages }` of list endpoints.
class PageInfo {
  const PageInfo({required this.page, required this.total, required this.totalPages});

  factory PageInfo.fromJson(Map<String, dynamic> j) => PageInfo(
        page: asInt(j['page']) ?? 1,
        total: asInt(j['total']) ?? 0,
        totalPages: asInt(j['totalPages']) ?? 0,
      );

  final int page;
  final int total;
  final int totalPages;

  bool get hasMore => page < totalPages;
}
