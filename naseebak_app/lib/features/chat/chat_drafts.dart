import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

/// What the member started typing in a chat, kept per member and chat (back, the app killed in the background) until
/// it is sent; all wiped on sign-out. Kept like [ChatCache]: in the app's cache directory, never in a backup.
///
/// A sign-out bumps [generation]: a chat room opened before it (and disposed after it, when the router removes it)
/// passes its own generation to [write], which then does nothing, so a draft never comes back after a sign-out.
abstract class ChatDrafts {
  int get generation;

  Future<String?> read(String memberId, String chatId);

  /// [text] empty removes the draft. [since] is the [generation] the caller read when it opened.
  Future<void> write(String memberId, String chatId, String text, {required int since});

  Future<void> clearAll();

  static String safe(String id) => id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
}

/// `chat_drafts/<member>/<chat>.txt` in the app's cache directory
class FileChatDrafts extends ChatDrafts {
  FileChatDrafts({Future<Directory> Function()? root}) : _root = root ?? getApplicationCacheDirectory;

  final Future<Directory> Function() _root;
  int _generation = 0;
  Future<void> _last = Future<void>.value();

  @override
  int get generation => _generation;

  Future<File> _file(String memberId, String chatId) async =>
      File('${(await _root()).path}/chat_drafts/${ChatDrafts.safe(memberId)}/${ChatDrafts.safe(chatId)}.txt');

  @override
  Future<String?> read(String memberId, String chatId) async {
    try {
      final f = await _file(memberId, chatId);
      if (!await f.exists()) return null;
      final text = utf8.decode(await f.readAsBytes());
      return text.trim().isEmpty ? null : text;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String memberId, String chatId, String text, {required int since}) {
    if (since != _generation) return Future<void>.value();
    final generation = _generation;
    // One after another, so an older write never lands after a newer one (or after a sign-out)
    return _last = _last.then((_) async {
      if (generation != _generation) return;
      try {
        final f = await _file(memberId, chatId);
        if (text.trim().isEmpty) {
          if (await f.exists()) await f.delete();
          return;
        }
        await f.parent.create(recursive: true);
        await f.writeAsString(text, flush: true);
      } catch (_) {}
    });
  }

  @override
  Future<void> clearAll() async {
    _generation++;
    await _last;
    try {
      final d = Directory('${(await _root()).path}/chat_drafts');
      if (await d.exists()) await d.delete(recursive: true);
    } catch (_) {}
  }
}

/// In memory (tests)
class MemoryChatDrafts extends ChatDrafts {
  final Map<String, String> data = {};
  int _generation = 0;

  @override
  int get generation => _generation;

  @override
  Future<String?> read(String memberId, String chatId) async => data['$memberId/$chatId'];

  @override
  Future<void> write(String memberId, String chatId, String text, {required int since}) async {
    if (since != _generation) return;
    text.trim().isEmpty ? data.remove('$memberId/$chatId') : data['$memberId/$chatId'] = text;
  }

  @override
  Future<void> clearAll() async {
    _generation++;
    data.clear();
  }
}

final chatDraftsProvider = Provider<ChatDrafts>((ref) => FileChatDrafts());
