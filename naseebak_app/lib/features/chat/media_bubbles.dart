import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/authed_media.dart';
import '../../core/privacy/screen_privacy.dart';
import '../../core/theme/app_theme.dart';
import 'chat_models.dart';
import 'voice_playback.dart';

export 'voice_playback.dart';

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
                        // Decoded at the bubble's size (a 2048 px photo would take ~16 MB); full size only in the viewer
                        image: ResizeImage(
                          provider,
                          width: (size.width * MediaQuery.devicePixelRatioOf(context)).round(),
                        ),
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
        // ✕ at the end side (left in Arabic), like every dialog of the app
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            key: const Key('photo-viewer-close'),
            icon: const Icon(Icons.close_rounded),
            tooltip: 'إغلاق',
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ],
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

/// `m:ss`, Western digits
String formatVoiceDuration(Duration d) {
  final s = d.inSeconds < 0 ? 0 : d.inSeconds;
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

/// A voice message: play/pause, progress and `m:ss`. The player lives in [VoicePlayback] (made on the first play), so
/// the note keeps playing when its bubble scrolls out of view. A failed load shows «تعذّر تشغيل الرسالة», which a tap
/// tries again; a 401 also goes through the app's sign-out path.
class VoiceBubble extends ConsumerStatefulWidget {
  const VoiceBubble({super.key, required this.message, this.color = AppColors.ink});
  final ChatMessage message;

  /// Icon and text colour (white on my navy bubble)
  final Color color;

  /// The playback key: my local file while sending, the message id after
  static String keyOf(ChatMessage m) => m.localPath ?? m.id;

  @override
  ConsumerState<VoiceBubble> createState() => _VoiceBubbleState();
}

class _VoiceBubbleState extends ConsumerState<VoiceBubble> {
  late final VoicePlayback _playback;
  late String _key;
  late VoiceSession _session;

  @override
  void initState() {
    super.initState();
    _playback = ref.read(voicePlaybackProvider);
    _key = VoiceBubble.keyOf(widget.message);
    _session = _playback.attach(_key);
  }

  @override
  void didUpdateWidget(VoiceBubble old) {
    super.didUpdateWidget(old);
    final key = VoiceBubble.keyOf(widget.message);
    if (key == _key) return;
    _key = key;
    // Handed over to the new key (my note confirmed): same session, nothing to swap
    if (identical(_playback.sessionFor(key), _session)) return;
    _playback.detach(_session);
    _session = _playback.attach(key);
  }

  @override
  void dispose() {
    _playback.detach(_session);
    super.dispose();
  }

  /// The length shown: the server's `durationSec` (what the sender saw, rounded up), so the label doesn't drop a
  /// second once the player reports the real, slightly shorter length
  Duration _shownTotal(VoiceNoteState s) {
    final sec = widget.message.media?.durationSec;
    if (sec != null && sec > 0) return Duration(seconds: sec);
    return s.realDuration ?? Duration.zero;
  }

  Future<void> _toggle() async {
    final local = widget.message.localPath;
    final url = widget.message.media?.url;
    if (local == null && url == null) {
      _session.value = _session.value.copyWith(failed: true);
      return;
    }
    // Providers are read now: the note may finish loading after this bubble has scrolled away
    final Future<VoiceSource> Function() source = local != null
        ? () async => (uri: Uri.file(local), headers: null)
        : () => authedMedia(ref, url!).then((m) => (uri: m.uri, headers: m.headers));
    final ok = await _playback.toggle(_key, source);
    // Signed out (401) → the API client's sign-out path; gone (404) stays a placeholder
    if (!ok && mounted && local == null) unawaited(probeMediaAccess(ref, url!));
  }

  void _retry() => setState(() => _session = _playback.reset(_key));


  @override
  Widget build(BuildContext context) {
    final c = widget.color;
    return ValueListenableBuilder<VoiceNoteState>(
      valueListenable: _session,
      builder: (context, s, _) {
        if (s.failed) {
          return InkWell(
            key: const Key('voice-retry'),
            onTap: _retry,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.refresh_rounded, color: c.withValues(alpha: 0.8), size: 20),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(voiceErrorText, style: TextStyle(color: c, fontSize: 14)),
                  ),
                ],
              ),
            ),
          );
        }
        // The progress bar runs against the player's real length once loaded (it ends exactly at 100 %)
        final shown = _shownTotal(s);
        final total = s.realDuration ?? shown;
        // Played to the end (or a stray position at the end): shown reset, with its length
        final atEnd = !s.playing && total > Duration.zero && s.position >= total;
        final started = !atEnd && (s.playing || s.position > Duration.zero);
        final progress =
            started && total.inMilliseconds > 0 ? (s.position.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0) : 0.0;
        return SizedBox(
          width: 210,
          child: Row(
            children: [
              SizedBox(
                width: 44,
                height: 44,
                child: s.loading
                    ? Padding(
                        padding: const EdgeInsets.all(12),
                        child: CircularProgressIndicator(strokeWidth: 2, color: c),
                      )
                    : IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                        tooltip: s.playing ? 'إيقاف مؤقت' : 'تشغيل',
                        icon: Icon(s.playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: c, size: 30),
                        onPressed: _toggle,
                      ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    LinearProgressIndicator(
                      value: progress,
                      minHeight: 4,
                      color: c,
                      backgroundColor: c.withValues(alpha: 0.25),
                      // Rounded by the indicator itself: no clip layer per bubble (scroll cost)
                      borderRadius: BorderRadius.circular(2),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      formatVoiceDuration(started ? s.position : shown),
                      style: TextStyle(color: c.withValues(alpha: 0.8), fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
