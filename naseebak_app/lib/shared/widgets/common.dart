import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';

/// The brand logo; `onDark` paints it white (navy backgrounds).
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.height = 44, this.onDark = false});
  final double height;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'نصيبك',
      image: true,
      child: SvgPicture.asset(
        'assets/images/logo.svg',
        height: height,
        colorFilter: onDark ? const ColorFilter.mode(Colors.white, BlendMode.srcIn) : null,
      ),
    );
  }
}

/// A full-width button that shows a spinner and ignores taps while [loading].
class LoadingButton extends StatelessWidget {
  const LoadingButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
    this.outlined = false,
    this.color,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final bool outlined;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final child = loading
        ? SizedBox(
            height: 22,
            width: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.4,
              color: outlined ? AppColors.navy : Colors.white,
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
              Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            ],
          );
    final action = loading ? null : onPressed;
    if (outlined) {
      return OutlinedButton(
        onPressed: action,
        style: color == null ? null : OutlinedButton.styleFrom(foregroundColor: color),
        child: child,
      );
    }
    return FilledButton(
      onPressed: action,
      style: color == null ? null : FilledButton.styleFrom(backgroundColor: color),
      child: child,
    );
  }
}

/// Centered message with an icon and an optional action (empty lists, errors).
class MessageView extends StatelessWidget {
  const MessageView({
    super.key,
    required this.icon,
    required this.title,
    this.body,
    this.actionLabel,
    this.onAction,
    this.iconColor,
  });

  final IconData icon;
  final String title;
  final String? body;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: (iconColor ?? AppColors.navy).withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 34, color: iconColor ?? AppColors.navy),
            ),
            const SizedBox(height: 18),
            Text(title, textAlign: TextAlign.center, style: theme.textTheme.titleMedium),
            if (body != null) ...[
              const SizedBox(height: 8),
              Text(
                body!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.muted),
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 20),
              SizedBox(
                width: 220,
                child: OutlinedButton(onPressed: onAction, child: Text(actionLabel!)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final network = error is ApiException && (error as ApiException).isNetwork;
    return MessageView(
      icon: network ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
      iconColor: AppColors.danger,
      title: network ? 'لا يوجد اتصال' : 'تعذّر التحميل',
      body: ApiException.messageOf(error),
      actionLabel: 'إعادة المحاولة',
      onAction: onRetry,
    );
  }
}

/// Grey placeholder blocks while a list loads.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 4, this.itemHeight = 120});
  final int count;
  final double itemHeight;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      itemCount: count,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, _) => SkeletonBox(height: itemHeight),
    );
  }
}

class SkeletonBox extends StatefulWidget {
  const SkeletonBox({super.key, this.height = 16, this.width, this.radius = 16});
  final double height;
  final double? width;
  final double radius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(_c),
      child: Container(
        height: widget.height,
        width: widget.width,
        decoration: BoxDecoration(
          color: AppColors.line.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      ),
    );
  }
}

/// A soft colored note (info / success / warning / error).
enum BannerTone { info, success, warning, danger }

class InfoBanner extends StatelessWidget {
  const InfoBanner({super.key, required this.text, this.tone = BannerTone.info, this.icon, this.action});
  final String text;
  final BannerTone tone;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, defaultIcon) = switch (tone) {
      BannerTone.info => (AppColors.navy.withValues(alpha: 0.06), AppColors.navy, Icons.info_outline_rounded),
      BannerTone.success => (AppColors.successBg, AppColors.success, Icons.check_circle_outline_rounded),
      BannerTone.warning => (AppColors.warningBg, AppColors.warning, Icons.schedule_rounded),
      BannerTone.danger => (AppColors.dangerBg, AppColors.danger, Icons.error_outline_rounded),
    };
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon ?? defaultIcon, color: fg, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(text, style: TextStyle(color: fg, fontSize: 14, height: 1.55)),
                if (action != null) ...[const SizedBox(height: 6), action!],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A small rounded label (status, tag).
class Pill extends StatelessWidget {
  const Pill({super.key, required this.text, this.color = AppColors.navy, this.icon});
  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 14, color: color), const SizedBox(width: 4)],
          Text(text, style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// Number badge for counts.
class CountBadge extends StatelessWidget {
  const CountBadge({super.key, required this.count, this.color = AppColors.gold});
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    return Container(
      constraints: const BoxConstraints(minWidth: 22),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
      child: Text(
        count > 99 ? '99+' : '$count',
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}

void showSnack(BuildContext context, String message, {SnackBarAction? action}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), action: action));
}

Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String body,
  required String confirmLabel,
  bool destructive = false,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title, style: Theme.of(ctx).textTheme.titleMedium),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('إلغاء')),
        FilledButton(
          style: destructive ? FilledButton.styleFrom(backgroundColor: AppColors.danger) : null,
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// Links that come from the server open only as a web page, an email or a call: a tampered value can't send the
/// phone to another app's scheme (`intent:`, `sms:`, a custom app link…). [extraSchemes]: e.g. the stores' own.
bool isSafeExternalLink(String url, {Set<String> extraSchemes = const {}}) {
  final uri = Uri.tryParse(url.trim());
  if (uri == null) return false;
  final scheme = uri.scheme.toLowerCase();
  if (scheme == 'https') return uri.host.isNotEmpty;
  return scheme == 'mailto' || scheme == 'tel' || extraSchemes.contains(scheme);
}

/// Opens a web page (terms, privacy, hosted checkout) outside the app.
Future<bool> openExternal(BuildContext context, String? url) async {
  if (url == null || url.isEmpty || !isSafeExternalLink(url)) {
    showSnack(context, 'الرابط غير متاح حالياً');
    return false;
  }
  final ok = await launchUrl(Uri.parse(url.trim()), mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) showSnack(context, 'تعذّر فتح الرابط');
  return ok;
}

/// Section title inside scrolling pages.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 10),
      child: Row(
        children: [
          Container(width: 4, height: 18, decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.titleMedium)),
          ?trailing,
        ],
      ),
    );
  }
}
