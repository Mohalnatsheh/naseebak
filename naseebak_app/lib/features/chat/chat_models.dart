import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_client.dart';
import '../../core/network/json.dart';

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
    this.unread = 0,
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
      unread: asInt(j['unread']) ?? 0,
    );
  }

  /// Same shape as the API (chat cache)
  Map<String, dynamic> toJson() => {
        'id': id,
        'matchId': matchId,
        'partner': {'id': partnerId, 'firstName': partnerName},
        'status': status,
        'expiresAt': expiresAt?.toUtc().toIso8601String(),
        'canExtend': canExtend,
        'endedByMe': endedByMe,
        'blocked': blocked,
        'matchHidden': matchHidden,
        'lastMessage': lastMessage == null
            ? null
            : {'body': lastMessage, 'createdAt': lastMessageAt?.toUtc().toIso8601String(), 'mine': lastMine},
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
  final int unread;

  /// Messages can be sent only in an open chat with no block either way.
  bool get canSend => status == 'ACTIVE' && !blocked && (expiresAt == null || expiresAt!.isAfter(DateTime.now()));
}

enum SendState { sending, sent, failed }

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
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: asStringOr(j['id']),
        body: asStringOr(j['body']),
        createdAt: asDate(j['createdAt']) ?? DateTime.now(),
        mine: asBool(j['mine']) ?? false,
        readAt: asDate(j['readAt']),
      );

  /// Same shape as the API (chat cache)
  Map<String, dynamic> toJson() => {
        'id': id,
        'body': body,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'mine': mine,
        'readAt': readAt?.toUtc().toIso8601String(),
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

  ChatMessage copyWith({SendState? state, String? error, bool filtered = false}) => ChatMessage(
        id: id,
        body: body,
        createdAt: createdAt,
        mine: mine,
        readAt: readAt,
        state: state ?? this.state,
        error: error,
        nonce: nonce,
        filtered: filtered,
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

final chatListProvider = FutureProvider.autoDispose<List<ChatSummary>>(
  (ref) => ref.watch(chatRepositoryProvider).list(),
);
