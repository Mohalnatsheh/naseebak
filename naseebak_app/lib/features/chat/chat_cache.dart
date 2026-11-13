import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import 'chat_models.dart';

/// What a chat room shows at once when it opens, before the network answers.
class CachedChat {
  const CachedChat({required this.conversation, required this.messages, required this.hasMore});
  final ChatSummary conversation;
  final List<ChatMessage> messages;
  final bool hasMore;
}

/// The newest messages of each chat kept on the device (like WhatsApp), so a chat opens instantly; the room still
/// refreshes from the API right after. Per member, and wiped on sign-out (private conversations on a shared phone).
abstract class ChatCache {
  /// Messages kept per chat (older ones load from the API when scrolling up)
  static const keep = 100;

  Future<CachedChat?> read(String memberId, String chatId);
  Future<void> write(String memberId, String chatId, CachedChat chat);
  Future<void> remove(String memberId, String chatId);

  /// Sign-out: every member's chats on this device
  Future<void> clearAll();

  /// A text that failed after its chat was left (audit B2): added to the chat's copy (replacing one with the same
  /// nonce), so the next visit shows it with «إعادة الإرسال». With no copy yet, one is started from [conversation]
  /// (`hasMore`, so older messages still load from the API); without a conversation nothing is written.
  Future<void> addFailed(String memberId, String chatId, ChatMessage failed, {ChatSummary? conversation}) =>
      _addFailed(memberId, chatId, failed, conversation: conversation);

  Future<void> _addFailed(String memberId, String chatId, ChatMessage failed,
      {ChatSummary? conversation, bool Function()? stillValid}) async {
    final copy = await read(memberId, chatId);
    if (stillValid != null && !stillValid()) return;
    final chat = copy?.conversation ?? conversation;
    if (chat == null) return;
    final messages = [...?copy?.messages.where((m) => m.nonce == null || m.nonce != failed.nonce), failed];
    await write(memberId, chatId,
        CachedChat(conversation: chat, messages: sortedForChat(messages), hasMore: copy?.hasMore ?? true));
  }

  /// Only confirmed messages, the newest [keep]
  static List<ChatMessage> trim(List<ChatMessage> messages) {
    final sent = messages.where((m) => m.state == SendState.sent).toList();
    return sent.length > keep ? sent.sublist(sent.length - keep) : sent;
  }

  /// My texts that failed to send (offline, refused by the filter): kept, so leaving the chat never loses one. A photo
  /// or voice note isn't (its file is temporary).
  static List<ChatMessage> failedTexts(List<ChatMessage> messages) =>
      messages.where((m) => m.state == SendState.failed && m.kind == MessageKind.text && m.nonce != null).toList();

  static Map<String, dynamic> encode(CachedChat c) => {
        'v': 2,
        'conversation': c.conversation.toJson(),
        'messages': [for (final m in trim(c.messages)) m.toJson()],
        'hasMore': c.hasMore || c.messages.where((m) => m.state == SendState.sent).length > keep,
        'failed': [
          for (final m in failedTexts(c.messages))
            {
              ...m.toJson(),
              'nonce': m.nonce,
              'error': m.error,
              'filtered': m.filtered,
              'maybeSent': m.maybeSent,
            },
        ],
      };

  static CachedChat? decode(Object? j) {
    if (j is! Map<String, dynamic> || j['v'] != 2) return null;
    final messages = j['messages'];
    final conversation = j['conversation'];
    if (messages is! List || conversation is! Map<String, dynamic>) return null;
    final failed = j['failed'];
    final kept = [for (final m in messages.whereType<Map<String, dynamic>>()) ChatMessage.fromJson(m)];
    if (failed is List) {
      for (final f in failed.whereType<Map<String, dynamic>>()) {
        final nonce = f['nonce'];
        if (nonce is! String) continue;
        final m = ChatMessage.fromJson(f);
        kept.add(ChatMessage(
          id: 'local-$nonce',
          body: m.body,
          createdAt: m.createdAt,
          mine: true,
          state: SendState.failed,
          nonce: nonce,
          error: f['error'] is String ? f['error'] as String : null,
          filtered: f['filtered'] == true,
          maybeSent: f['maybeSent'] == true,
          // A failed reply keeps its quote: «إعادة الإرسال» still sends `replyToId`
          replyTo: m.replyTo,
        ));
      }
    }
    return CachedChat(
      conversation: ChatSummary.fromJson(conversation),
      messages: sortedForChat(kept),
      hasMore: j['hasMore'] == true,
    );
  }
}

/// The chat's order: by time (then id, two messages can share a millisecond), a failed or refused message at the time
/// it was written; only what is still sending stays at the end, under everything.
List<ChatMessage> sortedForChat(Iterable<ChatMessage> messages) {
  final settled = messages.where((m) => m.state != SendState.sending).toList()
    ..sort((a, b) {
      final t = a.createdAt.compareTo(b.createdAt);
      return t != 0 ? t : a.id.compareTo(b.id);
    });
  return [...settled, ...messages.where((m) => m.state == SendState.sending)];
}

/// JSON files in the app's private cache directory: `chat_cache/<member>/<chat>.json`. A cache directory is never
/// copied to Google / iCloud backups (private conversations), and the OS may clear it: the chat then just reloads.
/// Writes to one chat run one after another (each through its own temp file); a sign-out (`clearAll`) waits for them
/// and makes any still queued give up, so nothing written before it reappears.
class FileChatCache extends ChatCache {
  FileChatCache({Future<Directory> Function()? root}) : _root = root ?? getApplicationCacheDirectory;

  final Future<Directory> Function() _root;

  /// The last queued write / remove per chat file (`<member>/<chat>`)
  final _queues = <String, Future<void>>{};

  /// Bumped by `clearAll`: a write queued before it doesn't land
  int _generation = 0;
  int _tmpSeq = 0;

  Future<Directory> _base() async => Directory('${(await _root()).path}/chat_cache');

  /// Ids come from our API; keep them to safe file-name characters anyway
  static String _safe(String id) => id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');

  Future<File> _file(String memberId, String chatId) async =>
      File('${(await _base()).path}/${_safe(memberId)}/${_safe(chatId)}.json');

  /// Runs [job] after everything already queued for this chat file
  Future<void> _queue(String memberId, String chatId, Future<void> Function() job) {
    final key = '${_safe(memberId)}/${_safe(chatId)}';
    final next = (_queues[key] ?? Future<void>.value()).then((_) => job());
    _queues[key] = next;
    next.whenComplete(() {
      if (identical(_queues[key], next)) _queues.remove(key);
    });
    return next;
  }

  @override
  Future<CachedChat?> read(String memberId, String chatId) async {
    try {
      final f = await _file(memberId, chatId);
      if (!await f.exists()) return null;
      final cached = ChatCache.decode(jsonDecode(await f.readAsString()));
      // An older version's file (or a broken one) is of no use any more: it goes now, not at the next write
      if (cached == null) await f.delete();
      return cached;
    } catch (e) {
      debugPrint('[chat-cache] read failed: $e');
      return null;
    }
  }

  @override
  Future<void> write(String memberId, String chatId, CachedChat chat) {
    // Encoded now: the caller keeps changing its message list while the write waits its turn
    final json = jsonEncode(ChatCache.encode(chat));
    final generation = _generation;
    return _queue(memberId, chatId, () async {
      File? tmp;
      try {
        if (generation != _generation) return;
        final f = await _file(memberId, chatId);
        await f.parent.create(recursive: true);
        // Write then rename: a crash mid-write never leaves a half file
        tmp = File('${f.path}.${DateTime.now().microsecondsSinceEpoch}-${_tmpSeq++}.tmp');
        await tmp.writeAsString(json, flush: true);
        if (generation != _generation) {
          await tmp.delete();
          return;
        }
        await tmp.rename(f.path);
      } catch (e) {
        debugPrint('[chat-cache] write failed: $e');
        try {
          if (tmp != null && await tmp.exists()) await tmp.delete();
        } catch (_) {}
      }
    });
  }

  /// After the writes already queued for this chat (the copy read is the newest), and never across a sign-out
  @override
  Future<void> addFailed(String memberId, String chatId, ChatMessage failed, {ChatSummary? conversation}) async {
    final generation = _generation;
    await (_queues['${_safe(memberId)}/${_safe(chatId)}'] ?? Future<void>.value());
    if (generation != _generation) return;
    await _addFailed(memberId, chatId, failed,
        conversation: conversation, stillValid: () => generation == _generation);
  }

  @override
  Future<void> remove(String memberId, String chatId) => _queue(memberId, chatId, () async {
        try {
          final f = await _file(memberId, chatId);
          if (await f.exists()) await f.delete();
        } catch (_) {}
      });

  @override
  Future<void> clearAll() async {
    _generation++;
    // A write past its last check finishes its rename first; then everything goes
    await Future.wait(_queues.values.toList());
    try {
      final d = await _base();
      if (await d.exists()) await d.delete(recursive: true);
    } catch (e) {
      debugPrint('[chat-cache] clear failed: $e');
    }
  }
}

/// In memory (tests)
class MemoryChatCache extends ChatCache {
  final Map<String, Map<String, dynamic>> data = {};

  @override
  Future<CachedChat?> read(String memberId, String chatId) async => ChatCache.decode(data['$memberId/$chatId']);

  @override
  Future<void> write(String memberId, String chatId, CachedChat chat) async =>
      data['$memberId/$chatId'] = jsonDecode(jsonEncode(ChatCache.encode(chat))) as Map<String, dynamic>;

  @override
  Future<void> remove(String memberId, String chatId) async => data.remove('$memberId/$chatId');

  @override
  Future<void> clearAll() async => data.clear();
}

final chatCacheProvider = Provider<ChatCache>((ref) => FileChatCache());
