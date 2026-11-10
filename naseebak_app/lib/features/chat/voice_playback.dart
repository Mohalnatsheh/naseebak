import 'dart:async';
import 'dart:io';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

/// What a voice note needs from a player; [JustAudioVoicePlayer] in the app, a fake in tests.
abstract class VoicePlayer {
  Stream<bool> get playingStream;
  Stream<Duration> get positionStream;

  /// Fires when playback reaches the end
  Stream<void> get completedStream;

  /// Returns the real duration when the player knows it
  Future<Duration?> load(Uri uri, {Map<String, String>? headers});

  /// Starts playing (doesn't wait for the end)
  void play();
  Future<void> pause();
  Future<void> seek(Duration position);

  /// Playback speed (1, 1.5 or 2); the pitch stays the same
  Future<void> setSpeed(double speed);
  Future<void> dispose();
}

class JustAudioVoicePlayer implements VoicePlayer {
  // Headers go straight to AVPlayer / ExoPlayer: just_audio's default local proxy is cleartext HTTP on 127.0.0.1,
  // which needs ATS / cleartext exceptions the app doesn't have.
  final _player = AudioPlayer(useProxyForRequestHeaders: false);

  @override
  Stream<bool> get playingStream =>
      _player.playerStateStream.map((s) => s.playing && s.processingState != ProcessingState.completed).distinct();

  @override
  Stream<Duration> get positionStream => _player.positionStream;

  @override
  Stream<void> get completedStream =>
      _player.processingStateStream.where((s) => s == ProcessingState.completed).map((_) {});

  @override
  Future<Duration?> load(Uri uri, {Map<String, String>? headers}) =>
      _player.setAudioSource(AudioSource.uri(uri, headers: headers));

  @override
  void play() {
    // just_audio's play() completes only when playback stops; errors surface through load / the state stream
    unawaited(_player.play().catchError((Object _) {}));
  }

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> seek(Duration position) => _player.seek(position);

  @override
  Future<void> setSpeed(double speed) => _player.setSpeed(speed);

  @override
  Future<void> dispose() => _player.dispose();
}

final voicePlayerFactoryProvider = Provider<VoicePlayer Function()>((ref) => JustAudioVoicePlayer.new);

/// iPhone: before a voice note plays, put the audio session in the playback category (spoken audio). The default
/// (`soloAmbient`) is muted by the ring/silent switch, and the recorder leaves `playAndRecord` behind after a note.
/// Android needs nothing. Never throws.
Future<void> prepareVoicePlayback() async {
  if (kIsWeb || !Platform.isIOS) return;
  try {
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.speech());
  } catch (_) {
    // Plays with whatever session there is
  }
}

/// Runs right before each play (tests count it)
final voiceAudioSessionProvider = Provider<Future<void> Function()>((ref) => prepareVoicePlayback);

/// What a voice note's bubble shows
@immutable
class VoiceNoteState {
  const VoiceNoteState({
    this.loading = false,
    this.loaded = false,
    this.playing = false,
    this.failed = false,
    this.position = Duration.zero,
    this.realDuration,
  });

  final bool loading;
  final bool loaded;
  final bool playing;
  final bool failed;
  final Duration position;

  /// What the player says once loaded
  final Duration? realDuration;

  VoiceNoteState copyWith({
    bool? loading,
    bool? loaded,
    bool? playing,
    bool? failed,
    Duration? position,
    Duration? realDuration,
  }) => VoiceNoteState(
    loading: loading ?? this.loading,
    loaded: loaded ?? this.loaded,
    playing: playing ?? this.playing,
    failed: failed ?? this.failed,
    position: position ?? this.position,
    realDuration: realDuration ?? this.realDuration,
  );
}

/// Where a voice note plays from: a local file (mine, still sending) or the server with its headers
typedef VoiceSource = ({Uri uri, Map<String, String>? headers});

/// One voice note's player and state. Owned by [VoicePlayback], not by its bubble: a bubble scrolled out of view
/// detaches and the note plays on; scrolled back, the new bubble attaches to the same session.
class VoiceSession extends ValueNotifier<VoiceNoteState> {
  VoiceSession(this._key) : super(const VoiceNoteState());

  String _key;

  /// The message this note belongs to (changes once when my note's upload is confirmed, see [VoicePlayback.handOver])
  String get key => _key;
  VoicePlayer? _player;
  final _subs = <StreamSubscription<Object?>>[];

  /// Bubbles showing this note right now
  int _attached = 0;

  /// The member asked for play and hasn't paused since (a pause during the load wins)
  bool _wantPlay = false;

  /// Played to the end and not started again: shown at its full length, ready to play from the start
  bool _ended = false;

  /// Where the member dragged the waveform before the note was loaded: the first play starts there
  Duration? _pendingSeek;
  bool _closed = false;

  bool get closed => _closed;

  void _set(VoiceNoteState s) {
    if (!_closed) value = s;
  }

  VoicePlayer _playerFrom(VoicePlayer Function() create) {
    final existing = _player;
    if (existing != null) return existing;
    final p = create();
    _player = p;
    _subs
      ..add(p.playingStream.listen((v) => _set(value.copyWith(playing: v))))
      // After the end, a late position (the player reporting where it stopped) never moves the bar back to full
      ..add(
        p.positionStream.listen((v) {
          if (_ended && v > Duration.zero) return;
          _set(value.copyWith(position: v));
        }),
      )
      ..add(
        p.completedStream.listen((_) async {
          // The player may be disposed meanwhile: an error here would reach Crashlytics as fatal
          try {
            await p.pause();
            await p.seek(Duration.zero);
          } catch (_) {}
          _wantPlay = false;
          _ended = true;
          _set(value.copyWith(position: Duration.zero, playing: false));
        }),
      );
    return p;
  }

  void _pause() {
    _wantPlay = false;
    // Shown paused at once (the player confirms a moment later); a second call before then is a no-op
    _set(value.copyWith(playing: false));
    final p = _player;
    if (p != null) unawaited(p.pause().catchError((Object _) {}));
  }

  void _close() {
    if (_closed) return;
    _closed = true;
    _wantPlay = false;
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
    final p = _player;
    _player = null;
    if (p != null) unawaited(p.dispose().catchError((Object _) {}));
    dispose();
  }
}

/// The chat's voice notes: one plays at a time, each player lives here (not in its bubble), so scrolling doesn't
/// stop a note. The chat room pauses it when the app leaves the foreground and closes everything when it is left.
class VoicePlayback {
  VoicePlayback({required VoicePlayer Function() createPlayer, Future<void> Function()? beforePlay})
    : _create = createPlayer,
      _beforePlay = beforePlay ?? (() async {});

  final VoicePlayer Function() _create;
  final Future<void> Function() _beforePlay;
  final _sessions = <String, VoiceSession>{};
  String? _current;

  /// False while the chat is recording a note: nothing plays (a play would take the microphone's audio session)
  bool Function()? canPlay;

  /// The note that owns playback (playing, or the last one played)
  String? get currentKey => _current;

  /// Live sessions (tests)
  int get sessionCount => _sessions.length;

  /// A bubble shows [key]: its session, made on demand
  VoiceSession attach(String key) {
    final s = _sessions.putIfAbsent(key, () => VoiceSession(key));
    s._attached++;
    return s;
  }

  /// [key] is the note asked to play right now (playing, or about to): false after a pause, while a recording blocks
  /// playback, or when another note took over. What «played» means for the unplayed dot.
  bool isStarted(String key) {
    final s = _sessions[key];
    return s != null && !s.closed && _current == key && s._wantPlay;
  }

  /// The session for [key], if one is live (no attach)
  VoiceSession? sessionFor(String key) => _sessions[key];

  /// A bubble left (scrolled away, or replaced): its session closes unless it is the note playing. By session, not
  /// key: the key may have changed meanwhile ([handOver]).
  void detach(VoiceSession s) {
    if (s._attached > 0) s._attached--;
    if (identical(_sessions[s.key], s)) _closeIfIdle(s);
  }

  /// My note's upload was confirmed: its key moves from the local file to the server id, and a note playing (or loaded)
  /// from the file carries on under the new key, so the new bubble shows it playing. Returns true when the session
  /// still uses the local file (the caller must keep the file until the chat is left).
  bool handOver(String from, String to) {
    final s = _sessions[from];
    if (s == null || from == to) return false;
    if (_sessions.containsKey(to)) {
      // The server copy already has its own bubble (a poll came first): the local one stops, nothing plays unseen
      _sessions.remove(from);
      if (_current == from) _current = null;
      s._close();
      return false;
    }
    _sessions.remove(from);
    s._key = to;
    _sessions[to] = s;
    if (_current == from) _current = to;
    return s._player != null;
  }

  void _closeIfIdle(VoiceSession s) {
    if (s._attached > 0 || _current == s.key) return;
    _sessions.remove(s.key);
    s._close();
  }

  /// A failed note: forget it and start again from scratch (the bubble's «إعادة المحاولة»)
  VoiceSession reset(String key) {
    final old = _sessions.remove(key);
    final attached = old?._attached ?? 0;
    if (_current == key) _current = null;
    old?._close();
    final s = VoiceSession(key).._attached = attached;
    _sessions[key] = s;
    return s;
  }

  /// Play or pause [key]. Playing pauses the note before it. Loads on the first play from [source]. Returns false
  /// when the load failed (the session shows it).
  Future<bool> toggle(String key, Future<VoiceSource> Function() source) async {
    final s = _sessions[key];
    if (s == null || s.closed || s.value.loading || s.value.failed) return true;
    if (s.value.playing || (s._wantPlay && _current == key)) {
      s._pause();
      return true;
    }
    if (!(canPlay?.call() ?? true)) return true;
    _claim(key);
    s._wantPlay = true;
    s._ended = false;
    if (!s.value.loaded) {
      final player = s._playerFrom(_create);
      unawaited(player.setSpeed(speed.value).catchError((Object _) {}));
      s._set(s.value.copyWith(loading: true));
      try {
        final src = await source();
        if (s.closed) return true;
        final real = await player.load(src.uri, headers: src.headers);
        if (s.closed) return true;
        s._set(
          s.value.copyWith(
            loading: false,
            loaded: true,
            realDuration: real != null && real > Duration.zero ? real : null,
          ),
        );
        final at = s._pendingSeek;
        s._pendingSeek = null;
        if (at != null && at > Duration.zero) {
          await player.seek(at).catchError((Object _) {});
          if (s.closed) return true;
        }
      } catch (_) {
        if (s.closed) return false;
        s._wantPlay = false;
        s._set(s.value.copyWith(loading: false, failed: true));
        if (_current == key) _current = null;
        _closeIfIdle(s);
        return false;
      }
    }
    await _beforePlay().catchError((Object _) {});
    if (s.closed || !s._wantPlay || _current != key || !(canPlay?.call() ?? true)) return true;
    s._player?.play();
    return true;
  }

  /// Speeds a note can play at, in the order the speed button cycles them
  static const speeds = [1.0, 1.5, 2.0];

  /// The speed every note plays at: one for the whole app run (WhatsApp-style), so the next note keeps it
  final speed = ValueNotifier<double>(1.0);

  /// 1× → 1.5× → 2× → 1×, applied at once to the note playing and to every loaded one
  void cycleSpeed() {
    final i = speeds.indexOf(speed.value);
    speed.value = speeds[(i + 1) % speeds.length];
    for (final s in _sessions.values) {
      final p = s._player;
      if (p != null) unawaited(p.setSpeed(speed.value).catchError((Object _) {}));
    }
  }

  /// The member tapped or dragged [key]'s waveform to [to]. A loaded note jumps there (playing or not); one never
  /// played yet remembers it and starts there on its first play.
  void seek(String key, Duration to) {
    final s = _sessions[key];
    if (s == null || s.closed || s.value.failed) return;
    final at = to < Duration.zero ? Duration.zero : to;
    s._ended = false;
    s._set(s.value.copyWith(position: at));
    final p = s._player;
    if (s.value.loaded && p != null) {
      unawaited(p.seek(at).catchError((Object _) {}));
    } else {
      s._pendingSeek = at;
    }
  }

  void _claim(String key) {
    final prev = _current;
    _current = key;
    if (prev == null || prev == key) return;
    final p = _sessions[prev];
    if (p == null) return;
    p._pause();
    _closeIfIdle(p);
  }

  /// The app left the foreground (or a recording starts): pause whatever plays
  void pauseCurrent() {
    final s = _sessions[_current];
    if (s != null && (s.value.playing || s._wantPlay)) s._pause();
  }

  /// The chat was left: every player goes
  void closeAll() {
    _current = null;
    final all = _sessions.values.toList();
    _sessions.clear();
    for (final s in all) {
      s._close();
    }
  }
}

final voicePlaybackProvider = Provider<VoicePlayback>((ref) {
  final p = VoicePlayback(
    createPlayer: ref.watch(voicePlayerFactoryProvider),
    beforePlay: ref.watch(voiceAudioSessionProvider),
  );
  ref.onDispose(p.closeAll);
  return p;
});
