import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';

/// Splits a Server-Sent Events byte stream into events (one per blank line). Only events that carry `data:`
/// count; `:` heartbeat comments are dropped.
class SseParser {
  final _buffer = StringBuffer();
  final _data = <String>[];
  String _event = 'message';

  /// Feeds decoded text; returns the events completed by it as (event name, data).
  List<(String, String)> add(String chunk) {
    final out = <(String, String)>[];
    _buffer.write(chunk);
    var text = _buffer.toString();
    _buffer.clear();
    while (true) {
      final i = text.indexOf('\n');
      if (i < 0) break;
      var line = text.substring(0, i);
      text = text.substring(i + 1);
      if (line.endsWith('\r')) line = line.substring(0, line.length - 1);
      if (line.isEmpty) {
        if (_data.isNotEmpty) out.add((_event, _data.join('\n')));
        _data.clear();
        _event = 'message';
      } else if (line.startsWith(':')) {
        continue;
      } else if (line.startsWith('data:')) {
        _data.add(line.substring(5).trimLeft());
      } else if (line.startsWith('event:')) {
        _event = line.substring(6).trim();
      }
    }
    _buffer.write(text);
    return out;
  }
}

/// Live chat events through Ably, read-only. The server issues a subscribe-only token request for my own
/// conversations (`GET /api/chats/ably-token`, 404 when Ably isn't configured); the app exchanges it for a
/// token and listens to the chat's channel over Ably's SSE endpoint. Every event only means "something
/// changed": the chat room then fetches from the API as before, so messages always come from our server.
class ChatLive {
  ChatLive(this._api, {Dio? ably}) : _ably = ably ?? Dio();

  final ApiClient _api;
  final Dio _ably;

  static const restHost = 'https://rest.ably.io';
  static const realtimeHost = 'https://realtime.ably.io';

  /// A token for the channels I may read, or null when live chat isn't available.
  Future<String?> token() async {
    final Json request;
    try {
      request = await _api.get('/api/chats/ably-token');
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
    final keyName = request['keyName'];
    if (keyName is! String || keyName.isEmpty) return null;
    final r = await _ably.post<dynamic>(
      '$restHost/keys/${Uri.encodeComponent(keyName)}/requestToken',
      data: request,
      options: Options(contentType: Headers.jsonContentType, responseType: ResponseType.json),
    );
    final data = r.data;
    return data is Map && data['token'] is String ? data['token'] as String : null;
  }

  /// Emits once per event on `chat:<id>` until the subscription is cancelled. Reconnects with a growing delay
  /// (and a fresh token); ends quietly when live chat isn't available. [connected] reports the link state.
  Stream<void> events(String chatId, {void Function(bool connected)? connected}) {
    late StreamController<void> controller;
    var active = true;
    CancelToken? cancel;

    Future<void> run() async {
      var delay = const Duration(seconds: 2);
      while (active) {
        try {
          final token = await this.token();
          if (token == null) break;
          cancel = CancelToken();
          final r = await _ably.get<ResponseBody>(
            '$realtimeHost/sse',
            queryParameters: {'v': '1.2', 'channels': 'chat:$chatId', 'accessToken': token},
            options: Options(responseType: ResponseType.stream, receiveTimeout: const Duration(minutes: 2)),
            cancelToken: cancel,
          );
          connected?.call(true);
          delay = const Duration(seconds: 2);
          final parser = SseParser();
          await for (final text in utf8.decoder.bind(r.data!.stream)) {
            if (!active) break;
            for (final _ in parser.add(text)) {
              if (!controller.isClosed) controller.add(null);
            }
          }
        } catch (_) {
          // Network trouble or an expired token: fall back to polling and try again later
        }
        connected?.call(false);
        if (!active) break;
        await Future<void>.delayed(delay);
        delay = delay * 2 > const Duration(minutes: 2) ? const Duration(minutes: 2) : delay * 2;
      }
      if (!controller.isClosed) await controller.close();
    }

    controller = StreamController<void>(
      onListen: run,
      onCancel: () {
        active = false;
        cancel?.cancel();
      },
    );
    return controller.stream;
  }
}

final chatLiveProvider = Provider<ChatLive>((ref) => ChatLive(ref.watch(apiClientProvider)));
