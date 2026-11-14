import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/common.dart';

/// «تسجيل الخروج» with a visible wait. Signing out first takes this phone off the push list and tells the server,
/// which can take seconds on a weak connection: the button shows a spinner and ignores further taps meanwhile
/// (it looked dead and could be tapped again).
class LogoutButton extends ConsumerStatefulWidget {
  const LogoutButton({
    super.key,
    this.confirm = false,
    this.compact = false,
    this.onDark = false,
    this.icon,
    this.enabled = true,
  });

  /// Ask «تسجيل الخروج من هذا الجهاز؟» first (the account page)
  final bool confirm;

  /// A short «خروج» text button (the setup's top bar) instead of the full-width outlined one
  final bool compact;

  /// A light «تسجيل الخروج» text button on a dark page (the splash after a failed restore)
  final bool onDark;
  final IconData? icon;

  /// False while the page is busy with something else
  final bool enabled;

  @override
  ConsumerState<LogoutButton> createState() => _LogoutButtonState();
}

class _LogoutButtonState extends ConsumerState<LogoutButton> {
  bool _busy = false;

  Future<void> _logout() async {
    if (_busy) return;
    if (widget.confirm) {
      final ok = await confirmDialog(context, title: 'تسجيل الخروج', body: 'تسجيل الخروج من هذا الجهاز؟', confirmLabel: 'خروج');
      if (!ok || !mounted) return;
    }
    // Read before the request: the router replaces this page once the session ends
    final auth = ref.read(authControllerProvider.notifier);
    setState(() => _busy = true);
    try {
      await auth.logout();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.onDark) {
      return TextButton(
        key: const Key('logout-on-dark'),
        style: TextButton.styleFrom(foregroundColor: Colors.white70, minimumSize: const Size(44, 44)),
        onPressed: _busy || !widget.enabled ? null : _logout,
        child: _busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white70))
            : const Text('تسجيل الخروج'),
      );
    }
    if (widget.compact) {
      return TextButton(
        onPressed: _busy || !widget.enabled ? null : _logout,
        child: _busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : const Text('خروج'),
      );
    }
    return LoadingButton(
      label: 'تسجيل الخروج',
      icon: widget.icon,
      outlined: true,
      loading: _busy,
      onPressed: widget.enabled ? _logout : null,
    );
  }
}
