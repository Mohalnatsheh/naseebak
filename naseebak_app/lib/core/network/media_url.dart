/// Photo URLs from the API are absolute CDN links in production, but relative (`/api/dev/uploads/...`) on a local
/// backend without Bunny. Relative ones are resolved against the API base URL.
String resolveMediaUrl(String baseUrl, String url) {
  if (url.isEmpty || url.startsWith('http://') || url.startsWith('https://')) return url;
  final base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
  return url.startsWith('/') ? '$base$url' : '$base/$url';
}
