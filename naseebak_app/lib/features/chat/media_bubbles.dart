import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/digits.dart';
import '../../core/network/authed_media.dart';
import '../../core/privacy/screen_privacy.dart';
import '../../core/theme/app_theme.dart';
import 'chat_format.dart';
import 'chat_models.dart';
import 'voice_playback.dart';
import 'voice_played_store.dart';

export 'voice_playback.dart';

/// Ink at 8% and 6%: a photo still loading, and the box behind a media placeholder
final Color _mediaLoadingTint = AppColors.ink.withValues(alpha: 0.08);
final Color _mediaPlaceholderTint = AppColors.ink.withValues(alpha: 0.06);

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
      // Another photo: its own 401 may be reported again
      _reported = false;
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
                  if (provider == null) return ColoredBox(color: _mediaLoadingTint);
                  return GestureDetector(
                    onTap: () => _openViewer(context),
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
                            ? ColoredBox(color: _mediaLoadingTint, child: const SizedBox.expand())
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

  void _openViewer(BuildContext context) {
    // Every photo of the chat, oldest first, so a swipe goes through them in the order they were sent
    var photos = (ChatPhotoGallery.maybeOf(context)?.call() ?? const <ChatMessage>[])
        .where(PhotoViewer.canShow)
        .toList();
    var index = photos.indexWhere((p) => p.id == widget.message.id);
    if (index < 0) {
      photos = [widget.message];
      index = 0;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PhotoViewer(
          photos: photos,
          initialIndex: index,
          partnerName: ChatPhotoGallery.partnerNameOf(context),
        ),
      ),
    );
  }
}

/// The chat's photos for the full-screen viewer, read when a photo is tapped (the chat room puts it above its list)
class ChatPhotoGallery extends InheritedWidget {
  const ChatPhotoGallery({super.key, required this.photos, this.partnerName = '', required super.child});

  /// The viewer's title for the partner's photos
  final String partnerName;

  static String partnerNameOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<ChatPhotoGallery>()?.partnerName ?? '';

  /// The chat's messages, oldest first (only the photos are kept)
  final List<ChatMessage> Function() photos;

  static List<ChatMessage> Function()? maybeOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<ChatPhotoGallery>()?.photos;

  @override
  bool updateShouldNotify(ChatPhotoGallery oldWidget) => false;
}

/// The chat's photos full screen: black, pinch (or double-tap) to zoom, swipe between them in the chat's order, ✕ at
/// the end side. No download or share. Private like the chat itself.
class PhotoViewer extends StatefulWidget {
  const PhotoViewer({super.key, required this.photos, this.initialIndex = 0, this.partnerName = ''});
  final List<ChatMessage> photos;
  final String partnerName;
  final int initialIndex;

  /// A photo the viewer can show: one with a server copy or my local file
  static bool canShow(ChatMessage m) => m.kind == MessageKind.image && (m.localPath != null || m.media?.url != null);

  @override
  State<PhotoViewer> createState() => _PhotoViewerState();
}

class _PhotoViewerState extends State<PhotoViewer> {
  late final PageController _pages;
  late int _index;

  /// A zoomed photo pans instead of turning the page
  bool _zoomed = false;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex.clamp(0, widget.photos.length - 1);
    _pages = PageController(initialPage: _index);
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  /// Who sent the photo on show and when: «أنت» or the partner's name, then the day and the time
  Widget _title() {
    final m = widget.photos[_index];
    final name = m.mine ? 'أنت' : (widget.partnerName.isEmpty ? 'الطرف الآخر' : widget.partnerName);
    return Column(
      key: const Key('photo-viewer-title'),
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(name, style: AppText.body.copyWith(color: Colors.white)),
        Text(
          '${chatDayLabel(m.createdAt)}، ${formatTime(m.createdAt)}',
          style: AppText.caption.copyWith(color: AppColors.onDarkMuted),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.photos.length;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        // ✕ at the end side (left in Arabic), like every dialog of the app
        automaticallyImplyLeading: false,
        centerTitle: true,
        title: _title(),
        actions: [
          if (n > 1)
            Center(
              child: Text(
                '${_index + 1} / $n',
                key: const Key('photo-viewer-count'),
                textDirection: TextDirection.ltr,
                style: AppText.caption.copyWith(color: Colors.white),
              ),
            ),
          IconButton(
            key: const Key('photo-viewer-close'),
            icon: const Icon(Icons.close_rounded),
            tooltip: 'إغلاق',
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ],
      ),
      body: SecureArea(
        child: PageView.builder(
          key: const Key('photo-viewer-pages'),
          controller: _pages,
          physics: _zoomed ? const NeverScrollableScrollPhysics() : const PageScrollPhysics(),
          itemCount: n,
          onPageChanged: (i) => setState(() {
            _index = i;
            _zoomed = false;
          }),
          itemBuilder: (context, i) => _ViewerPage(
            key: ValueKey(widget.photos[i].id),
            message: widget.photos[i],
            onZoomed: (z) {
              if (z != _zoomed) setState(() => _zoomed = z);
            },
          ),
        ),
      ),
    );
  }
}

/// One photo in the viewer, loaded at full size (Bearer header only to the API's own origin, see [authedMedia])
class _ViewerPage extends ConsumerStatefulWidget {
  const _ViewerPage({super.key, required this.message, required this.onZoomed});
  final ChatMessage message;
  final ValueChanged<bool> onZoomed;

  @override
  ConsumerState<_ViewerPage> createState() => _ViewerPageState();
}

class _ViewerPageState extends ConsumerState<_ViewerPage> {
  final _zoom = TransformationController();
  Future<AuthedMedia>? _media;

  @override
  void initState() {
    super.initState();
    final url = widget.message.media?.url;
    if (widget.message.localPath == null && url != null) _media = authedMedia(ref, url);
  }

  @override
  void dispose() {
    _zoom.dispose();
    super.dispose();
  }

  void _zoomEnded() => widget.onZoomed(_zoom.value.getMaxScaleOnAxis() > 1.01);

  void _toggleZoom() {
    final zoomed = _zoom.value.getMaxScaleOnAxis() > 1.01;
    if (zoomed) {
      _zoom.value = Matrix4.identity();
    } else {
      // The photo area (under the bar), not the whole screen
      final size = (context.findRenderObject() as RenderBox?)?.size ?? MediaQuery.sizeOf(context);
      // Twice the size around the middle of the photo area
      _zoom.value = Matrix4.identity()
        ..translateByDouble(-size.width / 2, -size.height / 2, 0, 1)
        ..scaleByDouble(2, 2, 1, 1);
    }
    widget.onZoomed(!zoomed);
  }

  Widget _image(ImageProvider provider) => Image(
    image: provider,
    fit: BoxFit.contain,
    errorBuilder: (context, _, _) =>
        const _MediaPlaceholder(icon: Icons.broken_image_outlined, text: photoErrorText, color: AppColors.onDarkMuted),
  );

  @override
  Widget build(BuildContext context) {
    final local = widget.message.localPath;
    final Widget content = local != null
        ? _image(FileImage(File(local)))
        : FutureBuilder<AuthedMedia>(
            future: _media,
            builder: (context, snap) {
              if (snap.hasError || (_media == null)) {
                return const _MediaPlaceholder(
                  icon: Icons.broken_image_outlined,
                  text: photoErrorText,
                  color: AppColors.onDarkMuted,
                );
              }
              final m = snap.data;
              if (m == null) return const SizedBox.shrink();
              return _image(ref.read(mediaImageProvider)(m.uri, m.headers));
            },
          );
    return GestureDetector(
      onDoubleTap: _toggleZoom,
      child: SizedBox.expand(
        child: InteractiveViewer(
          transformationController: _zoom,
          minScale: 1,
          maxScale: 5,
          onInteractionEnd: (_) => _zoomEnded(),
          child: Center(child: RepaintBoundary(child: content)),
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
      color: _mediaPlaceholderTint,
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
                style: AppText.labelRegular.copyWith(color: color),
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

/// A voice note's waveform: bar heights (0.2–1) drawn from the note's length and seeded by its message id, so the same
/// note always looks the same and two notes look different. No audio analysis: purely decorative, like a fingerprint.
/// Longer notes get more bars (20 to 36).
List<double> voiceWaveform(String seed, int durationSec) {
  final bars = (12 + durationSec * 2).clamp(20, 36);
  // FNV-1a over the id (String.hashCode is not stable between runs)
  var h = 0x811c9dc5;
  for (final c in seed.codeUnits) {
    h = ((h ^ c) * 0x01000193) & 0xFFFFFFFF;
  }
  var x = h == 0 ? 0x9E3779B9 : h;
  double next() {
    // xorshift32
    x ^= (x << 13) & 0xFFFFFFFF;
    x ^= x >> 17;
    x ^= (x << 5) & 0xFFFFFFFF;
    return x / 0xFFFFFFFF;
  }

  final out = <double>[];
  var prev = 0.5;
  for (var i = 0; i < bars; i++) {
    // Smoothed a little, so it reads like speech rather than noise
    final v = (prev + 2 * (0.2 + 0.8 * next())) / 3;
    out.add(v.clamp(0.2, 1.0));
    prev = v;
  }
  return out;
}

/// A screen reader's increase / decrease on a voice note's waveform moves this many seconds
const voiceSeekStepSec = 5;

/// `1×`, `1.5×`, `2×` (Western digits)
String formatVoiceSpeed(double speed) => '${speed == speed.roundToDouble() ? speed.toInt() : speed}×';

/// Paints [bars] across the width: the played part (from the start side) in full colour, the rest faded.
class VoiceWaveformPainter extends CustomPainter {
  const VoiceWaveformPainter({required this.bars, required this.progress, required this.color, required this.rtl});
  final List<double> bars;
  final double progress;
  final Color color;
  final bool rtl;

  @override
  void paint(Canvas canvas, Size size) {
    if (bars.isEmpty) return;
    final slot = size.width / bars.length;
    final stroke = (slot * 0.6).clamp(1.5, 3.0).toDouble();
    final played = Paint()
      ..color = color
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    final rest = Paint()
      ..color = color.withValues(alpha: 0.35)
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    final mid = size.height / 2;
    final maxH = size.height - stroke;
    for (var i = 0; i < bars.length; i++) {
      final f = (i + 0.5) / bars.length;
      final cx = rtl ? size.width - f * size.width : f * size.width;
      final half = bars[i] * maxH / 2;
      canvas.drawLine(Offset(cx, mid - half), Offset(cx, mid + half), f <= progress ? played : rest);
    }
  }

  @override
  bool shouldRepaint(VoiceWaveformPainter old) =>
      old.progress != progress || old.color != color || old.rtl != rtl || !identical(old.bars, bars);
}

/// A voice message: play/pause, a waveform that can be tapped or dragged to seek, `m:ss`, the speed (1× / 1.5× / 2×)
/// once started, and a dot on the partner's notes I have not played yet. The player lives in [VoicePlayback] (made on
/// the first play), so the note keeps playing when its bubble scrolls out of view. A failed load shows
/// «تعذّر تشغيل الرسالة», which a tap tries again; a 401 also goes through the app's sign-out path.
/// The waveform slider's screen-reader name: whose note it is (QA A-L08)
String voiceSliderLabel({required bool mine}) => mine ? 'رسالتك الصوتية' : 'رسالة صوتية من الطرف الآخر';

/// The slider's value as time, «0:12 من 0:45», never a percent (QA A-L08)
String voiceSliderValue(Duration at, Duration total) => '${formatVoiceDuration(at)} من ${formatVoiceDuration(total)}';

class VoiceBubble extends ConsumerStatefulWidget {
  const VoiceBubble({super.key, required this.message, this.color = AppColors.ink, this.waveSeed});
  final ChatMessage message;

  /// What seeds the waveform when not the message id: my note confirmed by the server keeps its sending bubble's look
  final String? waveSeed;

  /// Icon and text colour (white on my navy bubble)
  final Color color;

  static const width = 240.0;

  /// The playback key: my local file while sending, the message id after
  static String keyOf(ChatMessage m) => m.localPath ?? m.id;

  @override
  ConsumerState<VoiceBubble> createState() => _VoiceBubbleState();
}

class _VoiceBubbleState extends ConsumerState<VoiceBubble> {
  late final VoicePlayback _playback;
  late final VoicePlayedStore _played;
  late String _key;
  late VoiceSession _session;
  late List<double> _bars;

  /// Where a drag on the waveform is (0–1), shown until it ends and the note seeks there
  double? _drag;

  @override
  void initState() {
    super.initState();
    _playback = ref.read(voicePlaybackProvider);
    _played = ref.read(voicePlayedStoreProvider);
    _key = VoiceBubble.keyOf(widget.message);
    _session = _playback.attach(_key);
    _bars = _barsFor(widget);
  }

  static List<double> _barsFor(VoiceBubble w) =>
      voiceWaveform(w.waveSeed ?? w.message.id, w.message.media?.durationSec ?? 0);

  @override
  void didUpdateWidget(VoiceBubble old) {
    super.didUpdateWidget(old);
    if ((old.waveSeed ?? old.message.id) != (widget.waveSeed ?? widget.message.id) ||
        old.message.media?.durationSec != widget.message.media?.durationSec) {
      _bars = _barsFor(widget);
    }
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

  /// The partner's note, sent, and not played on this phone yet
  bool get _tracksPlayed =>
      !widget.message.mine && widget.message.localPath == null && widget.message.state == SendState.sent;

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
    // The partner's note counts as played once it really starts (a note that fails to load keeps its dot)
    final played = _tracksPlayed && !_session.value.playing ? widget.message.id : null;
    // Providers are read now: the note may finish loading after this bubble has scrolled away
    final Future<VoiceSource> Function() source = local != null
        ? () async => (uri: Uri.file(local), headers: null)
        : () => authedMedia(ref, url!).then((m) => (uri: m.uri, headers: m.headers));
    final ok = await _playback.toggle(_key, source);
    // Only when it was really started: a tap while a recording blocks playback (or during a load) plays nothing
    if (ok && played != null && _playback.isStarted(_key)) unawaited(_played.markPlayed(played));
    // Signed out (401) → the API client's sign-out path; gone (404) stays a placeholder
    if (!ok && mounted && local == null) unawaited(probeMediaAccess(ref, url!));
  }

  void _retry() => setState(() => _session = _playback.reset(_key));

  /// 0–1 along the waveform from where the finger is, from the start side (right in Arabic)
  double _fractionAt(Offset local, double width, bool rtl) {
    if (width <= 0) return 0;
    final f = (local.dx / width).clamp(0.0, 1.0);
    return rtl ? 1 - f : f;
  }

  void _seekTo(double fraction, Duration total) {
    if (total <= Duration.zero) return;
    // Never exactly the end: that would read as «played to the end» and reset
    final f = fraction.clamp(0.0, 0.99);
    _playback.seek(_key, Duration(milliseconds: (total.inMilliseconds * f).round()));
  }

  Widget _waveform(Color c, double progress, Duration total) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth;
        // Screen readers seek with increase / decrease, 5 s at a time
        final step = Duration(seconds: voiceSeekStepSec).inMilliseconds;
        final at = (progress * total.inMilliseconds).round();
        void seekBy(int ms) {
          if (total <= Duration.zero) return;
          _seekTo(((at + ms).clamp(0, total.inMilliseconds)) / total.inMilliseconds, total);
        }

        String time(int ms) => voiceSliderValue(Duration(milliseconds: ms.clamp(0, total.inMilliseconds)), total);
        return Semantics(
          label: voiceSliderLabel(mine: widget.message.mine),
          slider: true,
          value: time(at),
          increasedValue: time(at + step),
          decreasedValue: time(at - step),
          onIncrease: () => seekBy(step),
          onDecrease: () => seekBy(-step),
          child: GestureDetector(
            key: const Key('voice-waveform'),
            behavior: HitTestBehavior.opaque,
            onTapUp: (d) => _seekTo(_fractionAt(d.localPosition, w, rtl), total),
            onHorizontalDragStart: (d) => setState(() => _drag = _fractionAt(d.localPosition, w, rtl)),
            onHorizontalDragUpdate: (d) => setState(() => _drag = _fractionAt(d.localPosition, w, rtl)),
            onHorizontalDragEnd: (_) {
              final f = _drag;
              setState(() => _drag = null);
              if (f != null) _seekTo(f, total);
            },
            onHorizontalDragCancel: () => setState(() => _drag = null),
            child: SizedBox(
              height: 34,
              width: w,
              child: CustomPaint(
                painter: VoiceWaveformPainter(bars: _bars, progress: _drag ?? progress, color: c, rtl: rtl),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _speedButton(Color c) => ValueListenableBuilder<double>(
    valueListenable: _playback.speed,
    builder: (context, speed, _) => Semantics(
      button: true,
      label: 'سرعة التشغيل ${formatVoiceSpeed(speed)}',
      excludeSemantics: true,
      child: InkWell(
        key: const Key('voice-speed'),
        borderRadius: BorderRadius.circular(22),
        onTap: _playback.cycleSpeed,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: DecoratedBox(
              decoration: BoxDecoration(color: c.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                child: Text(
                  formatVoiceSpeed(speed),
                  textDirection: TextDirection.ltr,
                  style: AppText.caption.copyWith(color: c, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

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
                    child: Text(voiceErrorText, style: AppText.labelRegular.copyWith(color: c)),
                  ),
                ],
              ),
            ),
          );
        }
        // The progress runs against the player's real length once loaded (it ends exactly at 100 %)
        final shown = _shownTotal(s);
        final total = s.realDuration ?? shown;
        // Played to the end (or a stray position at the end): shown reset, with its length
        final atEnd = !s.playing && total > Duration.zero && s.position >= total;
        final started = !atEnd && (s.playing || s.position > Duration.zero);
        final progress = started && total.inMilliseconds > 0
            ? (s.position.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0)
            : 0.0;
        return SizedBox(
          width: VoiceBubble.width,
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
                    // The tooltip never takes a long-press: a long-press on the button selects the message
                    : TooltipTheme(
                        data: TooltipTheme.of(context).copyWith(triggerMode: TooltipTriggerMode.manual),
                        child: IconButton(
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                          tooltip: s.playing ? 'إيقاف مؤقت' : 'تشغيل',
                          icon: Icon(s.playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: c, size: 30),
                          onPressed: _toggle,
                        ),
                      ),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _waveform(c, progress, total),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          formatVoiceDuration(started ? s.position : shown),
                          style: AppText.caption.copyWith(color: c.withValues(alpha: 0.8)),
                        ),
                        if (_tracksPlayed)
                          ListenableBuilder(
                            listenable: _played,
                            builder: (context, _) => _played.isPlayed(widget.message.id)
                                ? const SizedBox.shrink()
                                : Padding(
                                    padding: const EdgeInsetsDirectional.only(start: 6),
                                    child: Semantics(
                                      label: 'لم تُسمع بعد',
                                      child: const DecoratedBox(
                                        key: Key('voice-unplayed'),
                                        // On the partner's white bubble: accent-ink, not the pale gold fill
                                        decoration: BoxDecoration(color: AppColors.goldText, shape: BoxShape.circle),
                                        child: SizedBox(width: 8, height: 8),
                                      ),
                                    ),
                                  ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              if (started) _speedButton(c),
            ],
          ),
        );
      },
    );
  }
}
