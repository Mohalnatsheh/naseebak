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

  /// Only confirmed messages, the newest [keep]
  static List<ChatMessage> trim(List<ChatMessage> messages) {
    final sent = messages.where((m) => m.state == SendState.sent).toList();
    return sent.length > keep ? sent.sublist(sent.length - keep) : sent;
  }

  static Map<String, dynamic> encode(CachedChat c) => {
        'v': 1,
        'conversation': c.conversation.toJson(),
        'messages': [for (final m in trim(c.messages)) m.toJson()],
        'hasMore': c.hasMore || c.messages.where((m) => m.state == SendState.sent).length > keep,
      };

  static CachedChat? decode(Object? j) {
    if (j is! Map<String, dynamic> || j['v'] != 1) return null;
    final messages = j['messages'];
    final conversation = j['conversation'];
    if (messages is! List || conversation is! Map<String, dynamic>) return null;
    return CachedChat(
      conversation: ChatSummary.fromJson(conversation),
      messages: [for (final m in messages.whereType<Map<String, dynamic>>()) ChatMessage.fromJson(m)],
      hasMore: j['hasMore'] == true,
    );
  }
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
      return ChatCache.decode(jsonDecode(await f.readAsString()));
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
