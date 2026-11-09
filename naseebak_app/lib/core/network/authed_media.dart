import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../storage/token_store.dart';
import 'media_url.dart';

typedef AuthedMedia = ({Uri uri, Map<String, String> headers});

/// A chat photo / voice note: `media.url` is relative (`/api/chats/<cid>/media/<mid>`) and the server answers only
/// with the member's Bearer token. Providers are read before the await, so a bubble that leaves meanwhile is safe.
Future<AuthedMedia> authedMedia(WidgetRef ref, String url) =>
    authedMediaFor(ref.read(apiBaseUrlProvider), ref.read(tokenStoreProvider), url);

/// The Bearer token goes only to the API's own origin (same scheme, host and port as [baseUrl]). An absolute URL on any
/// other host (a CDN, a stray link) is loaded without it.
Future<AuthedMedia> authedMediaFor(String baseUrl, TokenStore store, String url) async {
  final uri = Uri.parse(resolveMediaUrl(baseUrl, url));
  final token = sameOrigin(uri, Uri.parse(baseUrl)) ? await store.read() : null;
  return (uri: uri, headers: <String, String>{if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token'});
}

/// Same scheme, host and port (default ports filled in by [Uri.port]).
bool sameOrigin(Uri a, Uri b) =>
    a.scheme.toLowerCase() == b.scheme.toLowerCase() &&
    a.host.toLowerCase() == b.host.toLowerCase() &&
    a.port == b.port;

/// A media load answered 401 with a token: the same sign-out path as any API call ([ApiClient.onUnauthorized]).
void reportMediaUnauthorized(WidgetRef ref) => ref.read(apiClientProvider).onUnauthorized?.call();

/// The player can't say why a voice note failed: ask the server for one byte through the API client, whose
/// interceptor signs out on a 401 (a 404 — file gone — just stays a placeholder). Only for the API's own origin (the
/// client adds the token), and redirects are never followed, so the token can't travel to another host. Never throws.
Future<void> probeMediaAccess(WidgetRef ref, String url) async {
  final base = ref.read(apiBaseUrlProvider);
  final api = ref.read(apiClientProvider);
  final uri = Uri.parse(resolveMediaUrl(base, url));
  if (!sameOrigin(uri, Uri.parse(base))) return;
  try {
    // A relative URL goes through the client's base URL like every API call; a same-origin absolute one as is
    await api.dio.get<List<int>>(
      uri.hasScheme && url.contains('://') ? uri.toString() : url,
      options: Options(
        headers: {'Range': 'bytes=0-0'},
        responseType: ResponseType.bytes,
        followRedirects: false,
        // A 3xx is an answer here, not something to follow
        validateStatus: (s) => s != null && s < 400,
      ),
    );
  } catch (_) {
    // 401 is handled by the interceptor; anything else keeps the placeholder
  }
}
