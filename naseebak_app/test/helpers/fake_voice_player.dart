import 'dart:async';

import 'package:naseebak_app/features/chat/voice_playback.dart';

class FakeVoicePlayer implements VoicePlayer {
  FakeVoicePlayer({this.failLoad = false, this.realDuration});
  final bool failLoad;

  /// What the platform player reports once loaded (null = unknown)
  final Duration? realDuration;
  Uri? loadedUri;
  Map<String, String>? loadedHeaders;
  int plays = 0;
  int pauses = 0;
  bool disposed = false;
  final _playing = StreamController<bool>.broadcast();
  final _position = StreamController<Duration>.broadcast();
  final _completed = StreamController<void>.broadcast();

  @override
  Stream<bool> get playingStream => _playing.stream;
  @override
  Stream<Duration> get positionStream => _position.stream;
  @override
  Stream<void> get completedStream => _completed.stream;

  @override
  Future<Duration?> load(Uri uri, {Map<String, String>? headers}) async {
    loadedUri = uri;
    loadedHeaders = headers;
    if (failLoad) throw Exception('Source error');
    return realDuration;
  }

  @override
  void play() {
    plays++;
    _playing.add(true);
  }

  /// A player already torn down by the platform: pause/seek throw (the completion handler must swallow it)
  bool throwOnPause = false;

  @override
  Future<void> pause() async {
    pauses++;
    if (throwOnPause) throw StateError('disposed');
    _playing.add(false);
  }

  final seeks = <Duration>[];
  double speed = 1;

  @override
  Future<void> seek(Duration position) async {
    if (throwOnPause) throw StateError('disposed');
    seeks.add(position);
  }

  @override
  Future<void> setSpeed(double speed) async => this.speed = speed;

  @override
  Future<void> dispose() async => disposed = true;

  /// Plays to the end
  void complete() => _completed.add(null);
  void moveTo(Duration d) => _position.add(d);
}
