import 'package:dio/dio.dart' show DioMediaType, FormData, MultipartFile;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_client.dart';
import '../../core/network/json.dart';
import '../home/counts.dart';

/// `ChatSummary` of src/lib/chat/service.ts.
class ChatSummary {
  const ChatSummary({
    required this.id,
    required this.matchId,
    required this.partnerId,
    required this.partnerName,
    required this.status,
    this.expiresAt,
    this.canExtend = false,
    this.endedByMe = false,
    this.blocked = false,
    this.matchHidden = false,
    this.lastMessage,
    this.lastMessageAt,
    this.lastMine = false,
    this.lastRead = false,
    this.unread = 0,
    this.partnerIsPro = false,
    this.partnerActivity,
  });

  factory ChatSummary.fromJson(Map<String, dynamic> j) {
    final partner = asMap(j['partner']);
    final last = asMapOrNull(j['lastMessage']);
    return ChatSummary(
      id: asStringOr(j['id']),
      matchId: asStringOr(j['matchId']),
      partnerId: asStringOr(partner['id']),
      partnerName: asStringOr(partner['firstName']),
      status: asStringOr(j['status'], 'ACTIVE'),
      expiresAt: asDate(j['expiresAt']),
      canExtend: asBool(j['canExtend']) ?? false,
      endedByMe: asBool(j['endedByMe']) ?? false,
      blocked: asBool(j['blocked']) ?? false,
      matchHidden: asBool(j['matchHidden']) ?? false,
      lastMessage: last == null ? null : asString(last['body']),
      lastMessageAt: last == null ? null : asDate(last['createdAt']),
      lastMine: last == null ? false : (asBool(last['mine']) ?? false),
      lastRead: last == null ? false : (asBool(last['read']) ?? false),
      unread: asInt(j['unread']) ?? 0,
      partnerIsPro: asBool(partner['isPro']) ?? false,
      partnerActivity: asString(partner['activityLabel']),
    );
  }

  /// Same shape as the API (chat cache)
  Map<String, dynamic> toJson() => {
        'id': id,
        'matchId': matchId,
        'partner': {
          'id': partnerId,
          'firstName': partnerName,
          'isPro': partnerIsPro,
          if (partnerActivity != null) 'activityLabel': partnerActivity,
        },
        'status': status,
        'expiresAt': expiresAt?.toUtc().toIso8601String(),
        'canExtend': canExtend,
        'endedByMe': endedByMe,
        'blocked': blocked,
        'matchHidden': matchHidden,
        'lastMessage': lastMessage == null
            ? null
            : {'body': lastMessage, 'createdAt': lastMessageAt?.toUtc().toIso8601String(), 'mine': lastMine, 'read': lastRead},
        'unread': unread,
      };

  final String id;
  final String matchId;
  final String partnerId;
  final String partnerName;

  /// ACTIVE | ENDED | EXPIRED
  final String status;
  final DateTime? expiresAt;
  final bool canExtend;
  final bool endedByMe;
  final bool blocked;
  final bool matchHidden;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final bool lastMine;
  /// My last message was read by the other person (✓✓ in the list; false from servers before the field)
  final bool lastRead;
  final int unread;

  /// The other person is a Pro member (badge only)
  final bool partnerIsPro;

  /// «نشط اليوم» / «نشط هذا الأسبوع» for the chat header's status line, when the server sends one (optional field)
  final String? partnerActivity;

  /// Messages can be sent only in an open chat with no block either way.
  bool get canSend => status == 'ACTIVE' && !blocked && (expiresAt == null || expiresAt!.isAfter(DateTime.now()));
}

enum SendState { sending, sent, failed }

enum MessageKind { text, image, voice }

MessageKind parseMessageKind(Object? v) => switch (v) {
      'IMAGE' => MessageKind.image,
      'VOICE' => MessageKind.voice,
      _ => MessageKind.text,
    };

String messageKindName(MessageKind k) => switch (k) {
      MessageKind.image => 'IMAGE',
      MessageKind.voice => 'VOICE',
      MessageKind.text => 'TEXT',
    };

/// `media` of a chat message: `url` is relative (`/api/chats/<cid>/media/<mid>`) and needs the Bearer token.
class ChatMedia {
  const ChatMedia({required this.url, required this.type, this.durationSec, this.width, this.height});

  static ChatMedia? fromJsonOrNull(Object? v) {
    final j = asMapOrNull(v);
    if (j == null) return null;
    final url = asString(j['url']);
    if (url == null || url.isEmpty) return null;
    return ChatMedia.fromJson(j);
  }

  factory ChatMedia.fromJson(Map<String, dynamic> j) => ChatMedia(
        url: asStringOr(j['url']),
        type: asStringOr(j['type']),
        durationSec: asInt(j['durationSec']),
        width: asInt(j['width']),
        height: asInt(j['height']),
      );

  Map<String, dynamic> toJson() => {
        'url': url,
        'type': type,
        'durationSec': durationSec,
        'width': width,
        'height': height,
      };

  final String url;
  final String type;
  final int? durationSec;
  final int? width;
  final int? height;
}

/// `ChatMessage` of src/lib/chat/service.ts, plus local sending state for my own pending messages.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.body,
    required this.createdAt,
    required this.mine,
    this.readAt,
    this.state = SendState.sent,
    this.error,
    this.nonce,
    this.filtered = false,
    this.maybeSent = false,
    this.proRequired = false,
    this.kind = MessageKind.text,
    this.media,
    this.localPath,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: asStringOr(j['id']),
        body: asStringOr(j['body']),
        createdAt: asDate(j['createdAt']) ?? DateTime.now(),
        mine: asBool(j['mine']) ?? false,
        readAt: asDate(j['readAt']),
        kind: parseMessageKind(j['kind']),
        media: ChatMedia.fromJsonOrNull(j['media']),
      );

  /// Same shape as the API (chat cache). `localPath` is never written.
  Map<String, dynamic> toJson() => {
        'id': id,
        'body': body,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'mine': mine,
        'readAt': readAt?.toUtc().toIso8601String(),
        'kind': messageKindName(kind),
        'media': media?.toJson(),
      };

  final String id;
  final String body;
  final DateTime createdAt;
  final bool mine;
  final DateTime? readAt;
  final SendState state;

  /// Why sending failed (e.g. the filter's message about numbers/links)
  final String? error;
  final String? nonce;

  /// Refused by the chat filter: it must be edited, not resent as is
  final bool filtered;

  /// Failed without an answer (offline, timeout): the server may still have saved it (the chat room reconciles)
  final bool maybeSent;

  /// A photo / voice note refused with `PRO_REQUIRED` (Pro ended): resending it can't work, so no «إعادة الإرسال»
  final bool proRequired;

  final MessageKind kind;
  final ChatMedia? media;

  /// A local file shown while my photo / voice note is sending (never serialized)
  final String? localPath;

  /// Same server copy (a newer one differs, e.g. by its read tick)
  bool sameAs(ChatMessage o) =>
      id == o.id && body == o.body && mine == o.mine && createdAt == o.createdAt && readAt == o.readAt &&
      kind == o.kind && media?.url == o.media?.url;

  ChatMessage copyWith({
    SendState? state,
    String? error,
    bool filtered = false,
    bool maybeSent = false,
    bool proRequired = false,
  }) => ChatMessage(
        id: id,
        body: body,
        createdAt: createdAt,
        mine: mine,
        readAt: readAt,
        state: state ?? this.state,
        error: error,
        nonce: nonce,
        filtered: filtered,
        maybeSent: maybeSent,
        proRequired: proRequired,
        kind: kind,
        media: media,
        localPath: localPath,
      );
}

class ChatPage {
  const ChatPage({required this.conversation, required this.messages, required this.hasMore, this.chatEnabled = true});
  final ChatSummary conversation;
  final List<ChatMessage> messages;
  final bool hasMore;
  final bool chatEnabled;
}

class ChatRepository {
  ChatRepository(this._api);
  final ApiClient _api;

  Future<List<ChatSummary>> list() async {
    final j = await _api.get('/api/chats');
    return asMapList(j['conversations']).map(ChatSummary.fromJson).toList();
  }

  /// `GET /api/chats/{id}` — `before` (+ `beforeId`, the exact cursor) loads older, `after` polls newer (inclusive:
  /// the caller drops messages it already has).
  Future<ChatPage> load(String id, {DateTime? before, String? beforeId, DateTime? after}) async {
    final j = await _api.get('/api/chats/$id', query: {
      if (before != null) 'before': before.toUtc().toIso8601String(),
      if (before != null && beforeId != null) 'beforeId': beforeId,
      if (after != null) 'after': after.toUtc().toIso8601String(),
    });
    return ChatPage(
      conversation: ChatSummary.fromJson(asMap(j['conversation'])),
      messages: asMapList(j['messages']).map(ChatMessage.fromJson).toList(),
      hasMore: asBool(j['hasMore']) ?? false,
      chatEnabled: asBool(j['chatEnabled']) ?? true,
    );
  }

  Future<ChatMessage> send(String id, String body, {String? nonce}) async {
    final j = await _api.post('/api/chats/$id/messages', body: {'body': body, 'clientNonce': ?nonce});
    return ChatMessage.fromJson(asMap(j['message']));
  }

  /// `POST /api/chats/{id}/media`: a photo (`IMAGE`, `photo.jpg` as `image/jpeg`) or a voice note (`VOICE`,
  /// `voice.m4a` as `audio/mp4`, with `durationSec`). Returns the saved message; a resend with the same [nonce] is
  /// recognised by the server.
  Future<ChatMessage> sendMedia(
    String id, {
    required String kind,
    required String filePath,
    required String mime,
    int? durationSec,
    String? nonce,
  }) async {
    final type = DioMediaType.parse(mime);
    final form = FormData.fromMap({
      'kind': kind,
      'durationSec': ?durationSec?.toString(),
      'clientNonce': ?nonce,
      'file': MultipartFile.fromFileSync(
        filePath,
        filename: kind == 'VOICE' ? 'voice.m4a' : 'photo.jpg',
        contentType: type,
      ),
    });
    final j = await _api.postMultipart('/api/chats/$id/media', form);
    return ChatMessage.fromJson(asMap(j['message']));
  }

  Future<void> markRead(String id, {DateTime? upTo}) async {
    await _api.post('/api/chats/$id/read', body: {if (upTo != null) 'upTo': upTo.toUtc().toIso8601String()});
  }

  Future<void> end(String id, {String? reportReason, String? details}) async {
    await _api.post('/api/chats/$id/end', body: {
      if (reportReason != null)
        'report': {'reason': reportReason, if (details != null && details.trim().isNotEmpty) 'details': details.trim()},
    });
  }

  Future<void> extend(String id) async {
    await _api.post('/api/chats/$id/extend');
  }
}

final chatRepositoryProvider = Provider<ChatRepository>((ref) => ChatRepository(ref.watch(apiClientProvider)));

final chatListProvider = FutureProvider.autoDispose<List<ChatSummary>>((ref) {
  // The tab stays alive between visits: a change in unread messages (the counts reload on every tab switch and with the
  // tab bar's badge) reloads the list too, so its last message and badge match the tab's
  ref.watch(countsProvider.select((c) => c.valueOrNull?.unreadChats));
  return ref.watch(chatRepositoryProvider).list();
});
