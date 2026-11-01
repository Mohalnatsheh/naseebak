import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';

/// Keeps chats and a match's photos private on screen (MainActivity / AppDelegate, channel `naseebak/system`):
/// - Android: `FLAG_SECURE` while such a screen is open — screenshots and recordings come out black, and the
///   recent-apps preview is blank.
/// - iOS can't block a screenshot: the content is hidden while the screen is recorded or mirrored, and a note follows
///   a screenshot.
/// Counted, so two protected areas on screen at once (a chat over a match page) stay protected until both close.
class ScreenPrivacy {
  ScreenPrivacy._();

  static const _channel = MethodChannel('naseebak/system');
  static int _open = 0;
  static bool _listening = false;

  /// The screen is being recorded or mirrored (iOS)
  static final captured = ValueNotifier<bool>(false);
  static final _screenshots = StreamController<void>.broadcast();

  /// A screenshot was taken while a protected area was open (iOS)
  static Stream<void> get screenshots => _screenshots.stream;

  static void _listen() {
    if (_listening) return;
    _listening = true;
    _channel.setMethodCallHandler((call) async {
      switch (call.method) {
        case 'captureChanged':
          captured.value = call.arguments == true;
        case 'screenshotTaken':
          _screenshots.add(null);
      }
      return null;
    });
  }

  static Future<void> enter() async {
    _listen();
    if (_open++ > 0) return;
    await _set(true);
  }

  static Future<void> leave() async {
    if (_open == 0 || --_open > 0) return;
    await _set(false);
  }

  static Future<void> _set(bool on) async {
    try {
      final isCaptured = await _channel.invokeMethod<bool>('setSecure', on);
      if (on) captured.value = isCaptured ?? false;
    } catch (e) {
      // Tests and platforms without the channel: nothing to protect
      debugPrint('[privacy] $e');
    }
  }
}

/// Wrap a private area (a chat, a match's photos): protected while it is on screen.
class SecureArea extends StatefulWidget {
  const SecureArea({super.key, required this.child, this.screenshotNote});
  final Widget child;

  /// Shown after a screenshot (iOS); null for no note
  final String? screenshotNote;

  @override
  State<SecureArea> createState() => _SecureAreaState();
}

class _SecureAreaState extends State<SecureArea> {
  StreamSubscription<void>? _shots;

  @override
  void initState() {
    super.initState();
    ScreenPrivacy.enter();
    final note = widget.screenshotNote;
    if (note != null) {
      _shots = ScreenPrivacy.screenshots.listen((_) {
        if (!mounted) return;
        ScaffoldMessenger.maybeOf(context)
          ?..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(note), duration: const Duration(seconds: 5)));
      });
    }
  }

  @override
  void dispose() {
    _shots?.cancel();
    ScreenPrivacy.leave();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: ScreenPrivacy.captured,
      builder: (context, captured, child) => Stack(
        fit: StackFit.passthrough,
        children: [
          child!,
          if (captured)
            Positioned.fill(
              child: ClipRect(
                child: BackdropFilter(
                  key: const Key('privacy-cover'),
                  filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                  child: Container(
                    color: AppColors.navyDeep.withValues(alpha: 0.55),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.all(24),
                    child: const Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.visibility_off_rounded, color: Colors.white, size: 40),
                        SizedBox(height: 12),
                        Text(
                          'المحتوى مخفي أثناء تسجيل الشاشة أو مشاركتها، حفاظاً على الخصوصية.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white, fontSize: 15, height: 1.6),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      child: widget.child,
    );
  }
}
