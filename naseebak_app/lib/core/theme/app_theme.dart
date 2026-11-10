import 'package:flutter/material.dart';

/// Brand palette: deep navy + warm gold on a calm off-white. One token sheet shared with the website's `@theme`
/// (design review P1-1): the same names and values on both.
class AppColors {
  AppColors._();

  /// `primary`
  static const navy = Color(0xFF22476A);

  /// `primary-deep`: dark headers, pressed states
  static const navyDeep = Color(0xFF15304A);

  /// `primary-2`: gradients only (never a stray blue)
  static const navy2 = Color(0xFF2B5A84);

  /// `accent`: icons, rings, fills on navy (never text on a light background: 2.8:1)
  static const gold = Color(0xFFC19250);
  static const goldLight = Color(0xFFDDB97F);

  /// `accent-ink`: gold text on a light background (6.9:1)
  static const goldText = Color(0xFF7A5420);

  /// `accent-soft`: 12% gold, the "why" line and good-news fills
  static const goldSoft = Color(0x1FC19250);

  /// `sand`: the chat, the family steps and guardian consent («مجلس» rooms)
  static const sand = Color(0xFFF4F1EB);
  static const offWhite = Color(0xFFF7F9FB);

  /// `ink`
  static const ink = Color(0xFF1A2230);

  /// `muted-ink` (5.9:1 on white)
  static const muted = Color(0xFF5B646F);
  static const line = Color(0xFFE3E8EE);
  static const surface = Colors.white;
  static const success = Color(0xFF2E7D5B);
  static const successBg = Color(0xFFE6F4EC);
  static const warning = Color(0xFF9A6B12);
  static const warningBg = Color(0xFFFFF4DC);
  static const danger = Color(0xFFB3261E);
  static const dangerBg = Color(0xFFFDECEA);

  /// Chat: my bubbles in navy with white text, the other person's in white with ink text, on warm sand
  static const chatMine = navy;
  static const chatTheirs = Colors.white;
  static const chatBackdrop = sand;
}

/// Badge colours (design review P2-4): red only for "act now", navy for counts, gold for good news
enum BadgeTone { act, count, good }

extension BadgeToneColors on BadgeTone {
  Color get background => switch (this) {
        BadgeTone.act => AppColors.danger,
        BadgeTone.count => AppColors.navy,
        BadgeTone.good => AppColors.gold,
      };
  Color get foreground => this == BadgeTone.good ? AppColors.navyDeep : Colors.white;
}

/// One Cairo type scale, nothing under 12 (design review P1-2). Feature code uses these named styles (with
/// `copyWith` for colour or weight), never a raw `fontSize:`.
class AppText {
  AppText._();

  static const _f = 'Cairo';

  /// 28/36 800: the big greeting, the match moment
  static const display = TextStyle(fontFamily: _f, fontSize: 28, height: 36 / 28, fontWeight: FontWeight.w800);

  /// 22/30 800: names on cards, screen heroes
  static const title = TextStyle(fontFamily: _f, fontSize: 22, height: 30 / 22, fontWeight: FontWeight.w800);

  /// 18/28 700: section and card headings
  static const headline = TextStyle(fontFamily: _f, fontSize: 18, height: 28 / 18, fontWeight: FontWeight.w700);

  /// 16/26 400: reading text, inputs, buttons
  static const body = TextStyle(fontFamily: _f, fontSize: 16, height: 26 / 16, fontWeight: FontWeight.w400);

  /// 14/22 600: chips, secondary lines, list subtitles
  static const label = TextStyle(fontFamily: _f, fontSize: 14, height: 22 / 14, fontWeight: FontWeight.w600);

  /// 14/22 400: the label size for running text (muted lines, notes)
  static const labelRegular = TextStyle(fontFamily: _f, fontSize: 14, height: 22 / 14, fontWeight: FontWeight.w400);

  /// 12/18 500: times, captions, badges (the floor)
  static const caption = TextStyle(fontFamily: _f, fontSize: 12, height: 18 / 12, fontWeight: FontWeight.w500);

  /// A one-pixel transparent text: the OTP field's hidden input (never read, never seen)
  static const invisible = TextStyle(fontSize: 1, color: Colors.transparent);

  /// Fixed-width digits (rings, prices, clocks, counts)
  static const tabular = [FontFeature.tabularFigures()];

  /// A number inside a ring or tile of [box] logical pixels: scales with the box, never under the caption floor
  static TextStyle ringValue(double box) => display.copyWith(
        fontSize: (box * 0.27).clamp(12.0, 34.0),
        height: 1.1,
        fontFeatures: tabular,
      );
}

/// Corner radius scale (P1-1): 8 / 12 / 16 cards / 24 sheets / full
class AppRadius {
  AppRadius._();
  static const sm = 8.0;
  static const md = 12.0;
  static const card = 16.0;
  static const sheet = 24.0;
  static const full = 999.0;
}

/// Spacing in steps of 4 (P1-1)
class AppSpace {
  AppSpace._();
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 24.0;
  static const x3 = 32.0;
  static const x4 = 40.0;
  static const x5 = 56.0;
}

/// Shadows (P1-1): cards use a border only; floating bars and dialogs these
class AppShadows {
  AppShadows._();
  static const floating = [
    BoxShadow(color: Color(0x0F15304A), blurRadius: 2, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x0D15304A), blurRadius: 12, offset: Offset(0, 4)),
  ];
  static const dialog = [BoxShadow(color: Color(0x2415304A), blurRadius: 32, offset: Offset(0, 12))];
}

/// The motion system (P2-8): one easing curve and four durations, all zero when the phone asks for less motion
/// (`MediaQuery.disableAnimations`: iOS Reduce Motion, Android "Remove animations").
class AppMotion {
  AppMotion._();

  static const curve = Cubic(0.2, 0.7, 0.2, 1);
  static const press = Duration(milliseconds: 120);
  static const appear = Duration(milliseconds: 180);
  static const sheet = Duration(milliseconds: 280);
  static const seal = Duration(milliseconds: 600);

  /// True when animations should be skipped
  static bool reduced(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  /// [d], or zero with reduced motion
  static Duration of(BuildContext context, Duration d) => reduced(context) ? Duration.zero : d;
}

class AppTheme {
  AppTheme._();

  static const fontFamily = 'Cairo';

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.navy,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppColors.navy,
      onPrimary: Colors.white,
      secondary: AppColors.gold,
      onSecondary: Colors.white,
      tertiary: AppColors.goldLight,
      surface: AppColors.surface,
      onSurface: AppColors.ink,
      error: AppColors.danger,
      outline: AppColors.line,
      outlineVariant: AppColors.line,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: fontFamily,
      scaffoldBackgroundColor: AppColors.offWhite,
      visualDensity: VisualDensity.standard,
      materialTapTargetSize: MaterialTapTargetSize.padded,
    );

    final text = base.textTheme.apply(bodyColor: AppColors.ink, displayColor: AppColors.ink);

    return base.copyWith(
      // Material's slots follow the one Cairo scale (P1-2)
      textTheme: text.copyWith(
        displaySmall: AppText.display.copyWith(color: AppColors.ink),
        headlineSmall: AppText.title.copyWith(color: AppColors.ink),
        titleLarge: AppText.headline.copyWith(color: AppColors.ink),
        titleMedium: AppText.body.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink),
        titleSmall: AppText.label.copyWith(color: AppColors.ink),
        bodyLarge: AppText.body.copyWith(color: AppColors.ink),
        bodyMedium: AppText.labelRegular.copyWith(color: AppColors.ink),
        bodySmall: AppText.caption.copyWith(color: AppColors.muted),
        labelLarge: AppText.label.copyWith(color: AppColors.ink),
        labelMedium: AppText.caption.copyWith(fontWeight: FontWeight.w600, color: AppColors.ink),
        labelSmall: AppText.caption.copyWith(color: AppColors.muted),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.offWhite,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: fontFamily,
          fontSize: 18,
          height: 28 / 18,
          fontWeight: FontWeight.w700,
          color: AppColors.ink,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: const BorderSide(color: AppColors.line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.navy,
          foregroundColor: Colors.white,
          minimumSize: const Size(64, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
          textStyle: const TextStyle(fontFamily: fontFamily, fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.navy,
          minimumSize: const Size(64, 48),
          side: const BorderSide(color: AppColors.line, width: 1.2),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
          textStyle: const TextStyle(fontFamily: fontFamily, fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.navy,
          minimumSize: const Size(48, 48),
          textStyle: const TextStyle(fontFamily: fontFamily, fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppColors.navy, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppColors.danger),
        ),
      ),
      // A picked chip is navy with white text, clear at a glance (design review P2)
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: AppColors.surface,
        selectedColor: AppColors.navy,
        checkmarkColor: Colors.white,
        side: WidgetStateBorderSide.resolveWith(
          (states) => BorderSide(color: states.contains(WidgetState.selected) ? AppColors.navy : AppColors.line),
        ),
        // A plain style with a state colour: Flutter's chip resolves only `labelStyle.color` by state. A
        // WidgetStateTextStyle here was never resolved, so every label had no colour and iOS painted it white
        // (owner report 2026-11-10: unselected chips looked empty)
        labelStyle: AppText.label.copyWith(
          fontWeight: FontWeight.w600,
          color: WidgetStateColor.resolveWith(
            (states) => states.contains(WidgetState.selected) ? Colors.white : AppColors.ink,
          ),
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.gold.withValues(alpha: 0.18),
        height: 68,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontFamily: fontFamily,
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? AppColors.navy : AppColors.muted,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? AppColors.navy : AppColors.muted,
          ),
        ),
      ),
      tabBarTheme: const TabBarThemeData(
        labelColor: AppColors.navy,
        unselectedLabelColor: AppColors.muted,
        indicatorColor: AppColors.gold,
        labelStyle: TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w700, fontSize: 14),
        unselectedLabelStyle: TextStyle(fontFamily: fontFamily, fontWeight: FontWeight.w500, fontSize: 14),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.ink,
        contentTextStyle: TextStyle(fontFamily: fontFamily, color: Colors.white, fontSize: 14),
      ),
      // An off switch is still visible (QA A-L09: its grey track and thumb were under 3:1 on white)
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.white : AppColors.muted,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.navy : AppColors.surface,
        ),
        trackOutlineColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.navy : AppColors.muted,
        ),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.line, space: 1, thickness: 1),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        showDragHandle: true,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sheet)),
      ),
    );
  }
}
