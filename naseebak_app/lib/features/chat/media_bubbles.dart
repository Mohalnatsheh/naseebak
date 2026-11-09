import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

import '../../core/network/authed_media.dart';
import '../../core/privacy/screen_privacy.dart';
import '../../core/theme/app_theme.dart';
import 'chat_models.dart';

const photoErrorText = 'تعذّر عرض الصورة';
const voiceErrorText = 'تعذّر تشغيل الرسالة';

/// How a chat photo is fetched (tests replace it; the app loads it over the network with the Bearer header).
final mediaImageProvider = Provider<ImageProvider Function(Uri uri, Map<String, String> headers)>(
  (ref) =>
      (uri, headers) => NetworkImage(uri.toString(), headers: headers),
);

// ---------------------------------------------------------------------------------------------------------------------
// Photo

/// A photo message: the network image (Bearer header) at the photo's own proportions, or my local file while it is
/// still sending. Tap opens it full screen. A failed load (gone, signed out, offline) shows «تعذّر عرض الصورة»; a 401
/// also goes through the app's sign-out path.
class PhotoBubble extends ConsumerStatefulWidget {
  const PhotoBubble({super.key, required this.message});
  final ChatMessage message;

  static const maxWidth = 240.0;

  /// The bubble's size from the photo's width/height (4:3 when unknown), at most [maxWidth] wide
  static Size displaySize(int? width, int? height, {double maxW = maxWidth}) {
    var aspect = (width != null && height != null && width > 0 && height > 0) ? width / height : 4 / 3;
    aspect = aspect.clamp(0.6, 2.0);
    return Size(maxW, maxW / aspect);
  }

  @override
  ConsumerState<PhotoBubble> createState() => _PhotoBubbleState();
}

class _PhotoBubbleState extends ConsumerState<PhotoBubble> {
  Future<AuthedMedia>? _media;
  bool _reported = false;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  @override
  void didUpdateWidget(PhotoBubble old) {
    super.didUpdateWidget(old);
    if (old.message.media?.url != widget.message.media?.url || old.message.localPath != widget.message.localPath) {
      _resolve();
    }
  }

  void _resolve() {
    final url = widget.message.media?.url;
    _media = widget.message.localPath == null && url != null ? authedMedia(ref, url) : null;
  }

  ImageProvider? _provider(AuthedMedia? m) {
    final local = widget.message.localPath;
    if (local != null) return FileImage(File(local));
    if (m == null) return null;
    return ref.read(mediaImageProvider)(m.uri, m.headers);
  }

  void _onError(Object error, AuthedMedia? m) {
    if (_reported || error is! NetworkImageLoadException || error.statusCode != 401) return;
    if (m == null || !m.headers.containsKey('Authorization')) return;
    _reported = true;
    // Never change the session during a build
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) reportMediaUnauthorized(ref);
    });
  }

  @override
  Widget build(BuildContext context) {
    final media = widget.message.media;
    final size = PhotoBubble.displaySize(
      media?.width,
      media?.height,
      maxW: PhotoBubble.maxWidth.clamp(0, MediaQuery.sizeOf(context).width * 0.7).toDouble(),
    );
    final hasSource = widget.message.localPath != null || media != null;
    return SizedBox.fromSize(
      size: size,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: !hasSource
            ? const _MediaPlaceholder(icon: Icons.broken_image_outlined, text: photoErrorText)
            : FutureBuilder<AuthedMedia>(
                future: _media,
                builder: (context, snap) {
                  if (snap.hasError) {
                    return const _MediaPlaceholder(icon: Icons.broken_image_outlined, text: photoErrorText);
                  }
                  final provider = _provider(snap.data);
                  if (provider == null) return const ColoredBox(color: Color(0x14000000));
                  return GestureDetector(
                    onTap: () => _openViewer(context, provider),
                    child: Semantics(
                      label: 'صورة',
                      button: true,
                      child: Image(
                        image: provider,
                        fit: BoxFit.cover,
                        width: size.width,
                        height: size.height,
                        frameBuilder: (context, child, frame, sync) => frame == null && !sync
                            ? const ColoredBox(color: Color(0x14000000), child: SizedBox.expand())
                            : child,
                        errorBuilder: (context, error, _) {
                          _onError(error, snap.data);
                          return const _MediaPlaceholder(icon: Icons.broken_image_outlined, text: photoErrorText);
                        },
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }

  void _openViewer(BuildContext context, ImageProvider provider) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PhotoViewer(image: provider)));
  }
}

/// A chat photo full screen (pinch to zoom). Private like the chat itself.
class PhotoViewer extends StatelessWidget {
  const PhotoViewer({super.key, required this.image});
  final ImageProvider image;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          tooltip: 'إغلاق',
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SecureArea(
        child: SizedBox.expand(
          child: InteractiveViewer(
            minScale: 1,
            maxScale: 5,
            child: Center(
              child: Image(
                image: image,
                fit: BoxFit.contain,
                errorBuilder: (context, _, _) => const _MediaPlaceholder(
                  icon: Icons.broken_image_outlined,
                  text: photoErrorText,
                  color: Colors.white70,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MediaPlaceholder extends StatelessWidget {
  const _MediaPlaceholder({required this.icon, required this.text, this.color = AppColors.muted});
  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0x0F000000),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(height: 6),
              Text(
                text,
                textAlign: TextAlign.center,
                style: TextStyle(color: color, fontSize: 13),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Voice

/// What a voice bubble needs from a player; [JustAudioVoicePlayer] in the app, a fake in tests.
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
  Future<void> dispose() => _player.dispose();
}

final voicePlayerFactoryProvider = Provider<VoicePlayer Function()>((ref) => JustAudioVoicePlayer.new);

/// Only one voice note plays at a time: starting one pauses the one before.
class VoicePlayback {
  Object? _owner;
  VoidCallback? _pause;

  void claim(Object owner, VoidCallback pause) {
    if (_owner != null && !identical(_owner, owner)) _pause?.call();
    _owner = owner;
    _pause = pause;
  }

  void release(Object owner) {
    if (!identical(_owner, owner)) return;
    _owner = null;
    _pause = null;
  }
}

final voicePlaybackProvider = Provider<VoicePlayback>((ref) => VoicePlayback());

/// `m:ss`, Western digits
String formatVoiceDuration(Duration d) {
  final s = d.inSeconds < 0 ? 0 : d.inSeconds;
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

/// A voice message: play/pause, progress and `m:ss`. The player is made on the first play and disposed with the
/// bubble. A failed load shows «تعذّر تشغيل الرسالة»; a 401 also goes through the app's sign-out path.
class VoiceBubble extends ConsumerStatefulWidget {
  const VoiceBubble({super.key, required this.message, this.color = AppColors.ink});
  final ChatMessage message;

  /// Icon and text colour (white on my navy bubble)
  final Color color;

  @override
  ConsumerState<VoiceBubble> createState() => _VoiceBubbleState();
}

class _VoiceBubbleState extends ConsumerState<VoiceBubble> {
  VoicePlayer? _player;
  final _subs = <StreamSubscription<Object?>>[];
  late final VoicePlayback _playback;
  bool _loading = false;
  bool _loaded = false;
  bool _playing = false;
  bool _failed = false;
  Duration _position = Duration.zero;
  Duration? _realDuration;

  @override
  void initState() {
    super.initState();
    _playback = ref.read(voicePlaybackProvider);
  }

  Duration get _total => _realDuration ?? Duration(seconds: widget.message.media?.durationSec ?? 0);

  Future<void> _toggle() async {
    if (_loading || _failed) return;
    if (_playing) {
      await _player?.pause();
      return;
    }
    _playback.claim(this, () => _player?.pause());
    if (!_loaded) {
      final ok = await _load();
      if (!ok || !mounted) return;
    }
    _player!.play();
  }

  Future<bool> _load() async {
    final local = widget.message.localPath;
    final url = widget.message.media?.url;
    if (local == null && url == null) {
      setState(() => _failed = true);
      return false;
    }
    final player = _player ??= _createPlayer();
    setState(() => _loading = true);
    try {
      final Duration? real;
      if (local != null) {
        real = await player.load(Uri.file(local));
      } else {
        final m = await authedMedia(ref, url!);
        if (!mounted) return false;
        real = await player.load(m.uri, headers: m.headers);
      }
      if (!mounted) return false;
      setState(() {
        _loading = false;
        _loaded = true;
        if (real != null && real > Duration.zero) _realDuration = real;
      });
      return true;
    } catch (_) {
      if (!mounted) return false;
      setState(() {
        _loading = false;
        _failed = true;
      });
      _playback.release(this);
      // Signed out (401) → the API client's sign-out path; gone (404) stays a placeholder
      if (local == null) unawaited(probeMediaAccess(ref, url!));
      return false;
    }
  }

  VoicePlayer _createPlayer() {
    final p = ref.read(voicePlayerFactoryProvider)();
    _subs
      ..add(
        p.playingStream.listen((v) {
          if (mounted) setState(() => _playing = v);
        }),
      )
      ..add(
        p.positionStream.listen((v) {
          if (mounted) setState(() => _position = v);
        }),
      )
      ..add(
        p.completedStream.listen((_) async {
          await p.pause();
          await p.seek(Duration.zero);
          if (mounted) setState(() => _position = Duration.zero);
        }),
      );
    return p;
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _playback.release(this);
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.color;
    if (_failed) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline_rounded, color: c.withValues(alpha: 0.8), size: 20),
          const SizedBox(width: 6),
          Flexible(
            child: Text(voiceErrorText, style: TextStyle(color: c, fontSize: 14)),
          ),
        ],
      );
    }
    final total = _total;
    final started = _playing || _position > Duration.zero;
    final progress = total.inMilliseconds > 0 ? (_position.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0) : 0.0;
    return SizedBox(
      width: 210,
      child: Row(
        children: [
          SizedBox(
            width: 44,
            height: 44,
            child: _loading
                ? Padding(
                    padding: const EdgeInsets.all(12),
                    child: CircularProgressIndicator(strokeWidth: 2, color: c),
                  )
                : IconButton(
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                    tooltip: _playing ? 'إيقاف مؤقت' : 'تشغيل',
                    icon: Icon(_playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: c, size: 30),
                    onPressed: _toggle,
                  ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 4,
                    color: c,
                    backgroundColor: c.withValues(alpha: 0.25),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  formatVoiceDuration(started ? _position : total),
                  style: TextStyle(color: c.withValues(alpha: 0.8), fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
