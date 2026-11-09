import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// A voice note stops here and waits for «إرسال» or «إلغاء» (never sent on its own)
const maxVoiceDuration = Duration(seconds: 180);

/// `durationSec` sent with a voice note: the elapsed time rounded up, at least 1
int voiceDurationSec(Duration elapsed) {
  final seconds = (elapsed.inMilliseconds / 1000).ceil();
  return seconds < 1 ? 1 : seconds;
}

/// The microphone for one voice note: a thin layer over `record` so tests can fake it. One instance per recording;
/// the chat room disposes it when the recording is sent, cancelled or abandoned.
abstract class VoiceRecorder {
  /// Asks for the microphone (the system prompt shows only the first time); false = refused
  Future<bool> hasPermission();

  /// Starts recording AAC-LC 64 kbps to a new temporary `.m4a`
  Future<void> start();

  /// Time recorded so far (frozen once stopped)
  Duration get elapsed;

  /// Stops and returns the file (null when nothing was recorded)
  Future<String?> stop();

  /// Stops if still recording and deletes the file
  Future<void> cancel();

  /// Releases the microphone
  Future<void> dispose();
}

typedef VoiceRecorderFactory = VoiceRecorder Function();

/// A new recorder per voice note (tests replace it)
final voiceRecorderProvider = Provider<VoiceRecorderFactory>((ref) => RecordVoiceRecorder.new);

class RecordVoiceRecorder implements VoiceRecorder {
  final AudioRecorder _rec = AudioRecorder();
  final Stopwatch _clock = Stopwatch();
  String? _path;

  @override
  Future<bool> hasPermission() => _rec.hasPermission();

  @override
  Future<void> start() async {
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/voice-${DateTime.now().microsecondsSinceEpoch}.m4a';
    _path = path;
    await _rec.start(
      const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 44100),
      path: path,
    );
    _clock
      ..reset()
      ..start();
  }

  @override
  Duration get elapsed => _clock.elapsed;

  @override
  Future<String?> stop() async {
    _clock.stop();
    final path = await _rec.stop();
    return path ?? _path;
  }

  @override
  Future<void> cancel() async {
    _clock.stop();
    try {
      if (await _rec.isRecording()) {
        // Stops and deletes the file
        await _rec.cancel();
        return;
      }
    } catch (_) {}
    final path = _path;
    if (path == null) return;
    try {
      final file = File(path);
      if (file.existsSync()) await file.delete();
    } catch (_) {}
  }

  @override
  Future<void> dispose() => _rec.dispose();
}
