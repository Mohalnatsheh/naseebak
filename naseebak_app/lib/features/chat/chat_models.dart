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

/// The four reactions the server accepts (src/lib/chat/reactions.ts), in the menu's order
const chatReactionEmoji = ['❤️', '👍', '😊', '🤲'];

/// A reaction on a message: the emoji and whether it is mine (never who else reacted)
class ChatReaction {
  const ChatReaction({required this.emoji, required this.mine});

  factory ChatReaction.fromJson(Map<String, dynamic> j) =>
      ChatReaction(emoji: asStringOr(j['emoji']), mine: asBool(j['mine']) ?? false);

  Map<String, dynamic> toJson() => {'emoji': emoji, 'mine': mine};

  final String emoji;
  final bool mine;

  @override
  bool operator ==(Object other) => other is ChatReaction && other.emoji == emoji && other.mine == mine;

  @override
  int get hashCode => Object.hash(emoji, mine);
}

List<ChatReaction> parseReactions(Object? v) =>
    asMapList(v).map(ChatReaction.fromJson).where((r) => r.emoji.isNotEmpty).toList();

/// The live `reaction` event lists every reaction with its member's id: mine is the one with my id
List<ChatReaction> reactionsFromLive(Object? v, String? me) => [
      for (final r in asMapList(v))
        if (asString(r['emoji']) case final e? when e.isNotEmpty) ChatReaction(emoji: e, mine: me != null && r['userId'] == me),
    ];

/// My reaction changed to [emoji] (null removes it; the same one again removes it too), the other person's kept
List<ChatReaction> toggledReactions(List<ChatReaction> current, String? emoji) {
  final mine = current.where((r) => r.mine).map((r) => r.emoji).firstOrNull;
  final others = current.where((r) => !r.mine).toList();
  if (emoji == null || emoji == mine) return others;
  return [...others, ChatReaction(emoji: emoji, mine: true)];
}

/// The quoted message of a reply (same chat only; the snippet is built on the server from the filtered text)
class ReplyQuote {
  const ReplyQuote({required this.id, required this.mine, required this.kind, required this.snippet});

  static ReplyQuote? fromJsonOrNull(Object? v) {
    final j = asMapOrNull(v);
    final id = j == null ? null : asString(j['id']);
    if (j == null || id == null || id.isEmpty) return null;
    return ReplyQuote(
      id: id,
      mine: asBool(j['mine']) ?? false,
      kind: parseMessageKind(j['kind']),
      snippet: asStringOr(j['snippet']),
    );
  }

  Map<String, dynamic> toJson() => {'id': id, 'mine': mine, 'kind': messageKindName(kind), 'snippet': snippet};

  final String id;
  final bool mine;
  final MessageKind kind;
  final String snippet;
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
    this.replyTo,
    this.reactions = const [],
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: asStringOr(j['id']),
        body: asStringOr(j['body']),
        createdAt: asDate(j['createdAt']) ?? DateTime.now(),
        mine: asBool(j['mine']) ?? false,
        readAt: asDate(j['readAt']),
        kind: parseMessageKind(j['kind']),
        media: ChatMedia.fromJsonOrNull(j['media']),
        replyTo: ReplyQuote.fromJsonOrNull(j['replyTo']),
        reactions: parseReactions(j['reactions']),
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
        'replyTo': replyTo?.toJson(),
        'reactions': [for (final r in reactions) r.toJson()],
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

  /// The message this one answers (null for none, and from servers before the field)
  final ReplyQuote? replyTo;

  /// One per member at most (empty from servers before the field)
  final List<ChatReaction> reactions;

  String? get myReaction => reactions.where((r) => r.mine).map((r) => r.emoji).firstOrNull;

  /// Same server copy (a newer one differs, e.g. by its read tick)
  bool sameAs(ChatMessage o) =>
      id == o.id && body == o.body && mine == o.mine && createdAt == o.createdAt && readAt == o.readAt &&
      kind == o.kind && media?.url == o.media?.url && replyTo?.id == o.replyTo?.id && _sameReactions(o.reactions);

  bool _sameReactions(List<ChatReaction> o) {
    if (o.length != reactions.length) return false;
    for (var i = 0; i < o.length; i++) {
      if (o[i] != reactions[i]) return false;
    }
    return true;
  }

  ChatMessage withReactions(List<ChatReaction> next) => ChatMessage(
        id: id,
        body: body,
        createdAt: createdAt,
        mine: mine,
        readAt: readAt,
        state: state,
        error: error,
        nonce: nonce,
        filtered: filtered,
        maybeSent: maybeSent,
        proRequired: proRequired,
        kind: kind,
        media: media,
        localPath: localPath,
        replyTo: replyTo,
        reactions: next,
      );

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
        replyTo: replyTo,
        reactions: reactions,
      );
}

class ChatPage {
  const ChatPage({
    required this.conversation,
    required this.messages,
    required this.hasMore,
    this.chatEnabled = true,
    this.partnerTyping = false,
    this.starters = const [],
    this.bothWrote,
    this.polledAt,
    this.reactionUpdates,
  });
  final ChatSummary conversation;
  final List<ChatMessage> messages;
  final bool hasMore;
  final bool chatEnabled;

  /// The other person typed in the last few seconds (the polling fallback for the live `typing` event)
  final bool partnerTyping;

  /// Conversation starters, sent only while I haven't written anything in an open chat
  final List<String> starters;

  /// Both members have written somewhere in the chat (the whole chat, not this page); null from servers before the
  /// field, when the loaded messages decide
  final bool? bothWrote;

  /// The server's time when it answered (null from servers before the field): the next poll sends it back, less a
  /// few seconds, as `reactionsSince`
  final DateTime? polledAt;

  /// A poll with `reactionsSince`: message id → all its reactions now (empty = the last one was removed), for
  /// messages whose reactions changed since then, older ones included. The polling fallback for the live `reaction`.
  final Map<String, List<ChatReaction>>? reactionUpdates;
}

/// `reactionUpdates` of the chat GET: `[{messageId, reactions: [{emoji, mine}]}]` (null when absent)
Map<String, List<ChatReaction>>? parseReactionUpdates(Object? v) {
  if (v is! List) return null;
  final out = <String, List<ChatReaction>>{};
  for (final u in asMapList(v)) {
    final id = asString(u['messageId']);
    if (id != null && id.isNotEmpty) out[id] = parseReactions(u['reactions']);
  }
  return out;
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
  Future<ChatPage> load(String id, {DateTime? before, String? beforeId, DateTime? after, DateTime? reactionsSince}) async {
    final j = await _api.get('/api/chats/$id', query: {
      if (before != null) 'before': before.toUtc().toIso8601String(),
      if (before != null && beforeId != null) 'beforeId': beforeId,
      if (after != null) 'after': after.toUtc().toIso8601String(),
      if (after != null && reactionsSince != null) 'reactionsSince': reactionsSince.toUtc().toIso8601String(),
    });
    return ChatPage(
      conversation: ChatSummary.fromJson(asMap(j['conversation'])),
      messages: asMapList(j['messages']).map(ChatMessage.fromJson).toList(),
      hasMore: asBool(j['hasMore']) ?? false,
      chatEnabled: asBool(j['chatEnabled']) ?? true,
      partnerTyping: asBool(j['partnerTyping']) ?? false,
      starters: asStringList(j['starters']).where((s) => s.trim().isNotEmpty).toList(),
      bothWrote: asBool(j['bothWrote']),
      polledAt: asDate(j['polledAt']),
      reactionUpdates: parseReactionUpdates(j['reactionUpdates']),
    );
  }

  /// A text message; [replyToId] quotes a message of the same chat (the server refuses any other with 400)
  Future<ChatMessage> send(String id, String body, {String? nonce, String? replyToId}) async {
    final j = await _api.post(
      '/api/chats/$id/messages',
      body: {'body': body, 'clientNonce': ?nonce, 'replyToId': ?replyToId},
    );
    return ChatMessage.fromJson(asMap(j['message']));
  }

  /// `{emoji}` sets mine (the same one again removes it), null removes it. Returns the message's reactions.
  Future<List<ChatReaction>> react(String id, String messageId, String? emoji) async {
    final j = await _api.post('/api/chats/$id/messages/$messageId/reaction', body: {'emoji': emoji});
    return parseReactions(j['reactions']);
  }

  /// «يكتب الآن…» for the other person (the caller sends it at most every 3 s, see `TypingThrottle`)
  Future<void> typing(String id) async {
    await _api.post('/api/chats/$id/typing');
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
    String? replyToId,
  }) async {
    final type = DioMediaType.parse(mime);
    final form = FormData.fromMap({
      'kind': kind,
      'durationSec': ?durationSec?.toString(),
      'clientNonce': ?nonce,
      'replyToId': ?replyToId,
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

  /// Ends the chat for both; with [reportReason] it is also a report (and a block). [messageId] names the message
  /// reported («إبلاغ عن الرسالة»): servers before the field ignore it, so the details still quote the message.
  /// Ends the chat (with a report: also blocks). [end] false with a report is «إبلاغ فقط»: the report is filed and
  /// the chat stays open (`end: false`, server WC2-16).
  Future<void> end(String id, {String? reportReason, String? details, String? messageId, bool end = true}) async {
    await _api.post('/api/chats/$id/end', body: {
      if (!end && reportReason != null) 'end': false,
      if (reportReason != null)
        'report': {
          'reason': reportReason,
          if (details != null && details.trim().isNotEmpty) 'details': details.trim(),
          'messageId': ?messageId,
        },
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
