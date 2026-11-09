import 'package:flutter/material.dart';

/// Brand palette: deep navy + warm gold on a calm off-white.
class AppColors {
  AppColors._();

  static const navy = Color(0xFF22476A);
  static const navyDeep = Color(0xFF15304A);
  static const gold = Color(0xFFC19250);
  static const goldLight = Color(0xFFDDB97F);

  /// Gold text on a light gold background (the «Pro» badge)
  static const goldText = Color(0xFF7A5420);
  static const offWhite = Color(0xFFF7F9FB);
  static const ink = Color(0xFF1A2230);
  static const muted = Color(0xFF5E6B7D);
  static const line = Color(0xFFE3E8EE);
  static const surface = Colors.white;
  static const success = Color(0xFF2E7D5B);
  static const successBg = Color(0xFFE6F4EC);
  static const warning = Color(0xFF9A6B12);
  static const warningBg = Color(0xFFFFF4DC);
  static const danger = Color(0xFFB3261E);
  static const dangerBg = Color(0xFFFDECEA);

  /// Chat: my bubbles in navy with white text, the other person's in white with ink text, on a warm off-white
  static const chatMine = navy;
  static const chatTheirs = Colors.white;
  static const chatBackdrop = Color(0xFFF4F1EB);
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
      textTheme: text.copyWith(
        headlineSmall: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700, height: 1.35),
        titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700, height: 1.35),
        titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w700, height: 1.4),
        bodyLarge: text.bodyLarge?.copyWith(height: 1.6),
        bodyMedium: text.bodyMedium?.copyWith(height: 1.6),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.offWhite,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: fontFamily,
          fontSize: 19,
          fontWeight: FontWeight.w700,
          color: AppColors.ink,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.navy,
          foregroundColor: Colors.white,
          minimumSize: const Size(64, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontFamily: fontFamily, fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.navy,
          minimumSize: const Size(64, 52),
          side: const BorderSide(color: AppColors.line, width: 1.2),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
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
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.navy, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.danger),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: AppColors.surface,
        selectedColor: AppColors.navy.withValues(alpha: 0.1),
        // A picked chip also gets a navy edge (same width as the grey one)
        side: WidgetStateBorderSide.resolveWith(
          (states) => BorderSide(color: states.contains(WidgetState.selected) ? AppColors.navy : AppColors.line),
        ),
        labelStyle: const TextStyle(fontFamily: fontFamily, color: AppColors.ink, fontSize: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
      dividerTheme: const DividerThemeData(color: AppColors.line, space: 1, thickness: 1),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        showDragHandle: true,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
    );
  }
}
