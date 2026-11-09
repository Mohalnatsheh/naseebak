import 'dart:async';
import 'dart:io';

import 'package:naseebak_app/features/chat/voice_recorder.dart';

/// A recorder that writes a few bytes to [dir] instead of using the microphone
class FakeRecorder implements VoiceRecorder {
  FakeRecorder(this.dir, this.permission);
  final Directory dir;
  final Future<bool> Function() permission;
  Duration now = Duration.zero;
  bool asked = false;
  bool started = false;
  bool stopped = false;
  bool cancelled = false;
  bool disposed = false;
  File? file;

  @override
  Future<bool> hasPermission() {
    asked = true;
    return permission();
  }

  bool failStart = false;

  /// While set, [start] waits for it (a slow microphone)
  Completer<void>? startGate;

  @override
  Future<void> start() async {
    if (failStart) throw StateError('no microphone');
    if (startGate != null) await startGate!.future;
    started = true;
    file = File('${dir.path}/voice-${DateTime.now().microsecondsSinceEpoch}.m4a')..writeAsBytesSync([0, 1, 2, 3]);
  }

  @override
  Duration get elapsed => now;

  double levelNow = 0.5;

  @override
  Future<double> level() async => levelNow;

  @override
  Future<String?> stop() async {
    stopped = true;
    return file?.path;
  }

  @override
  Future<void> cancel() async {
    cancelled = true;
    final f = file;
    if (f != null && f.existsSync()) f.deleteSync();
  }

  @override
  Future<void> dispose() async => disposed = true;
}
