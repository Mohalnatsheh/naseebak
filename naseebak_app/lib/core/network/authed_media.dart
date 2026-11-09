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

Future<AuthedMedia> authedMediaFor(String baseUrl, TokenStore store, String url) async {
  final token = await store.read();
  return (
    uri: Uri.parse(resolveMediaUrl(baseUrl, url)),
    headers: <String, String>{if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token'},
  );
}

/// A media load answered 401 with a token: the same sign-out path as any API call ([ApiClient.onUnauthorized]).
void reportMediaUnauthorized(WidgetRef ref) => ref.read(apiClientProvider).onUnauthorized?.call();

/// The player can't say why a voice note failed: ask the server for one byte through the API client, whose
/// interceptor signs out on a 401 (a 404 — file gone — just stays a placeholder). Never throws.
Future<void> probeMediaAccess(WidgetRef ref, String url) async {
  final api = ref.read(apiClientProvider);
  try {
    await api.dio.get<List<int>>(
      url,
      options: Options(headers: {'Range': 'bytes=0-0'}, responseType: ResponseType.bytes),
    );
  } catch (_) {
    // 401 is handled by the interceptor; anything else keeps the placeholder
  }
}
