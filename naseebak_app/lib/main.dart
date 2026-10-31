import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/app.dart';
import 'app/providers.dart';
import 'core/push/push_service.dart';
import 'core/storage/token_store.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Designed for phones held upright (also set in AndroidManifest / Info.plist)
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await initializeDateFormatting('ar');
  // Western digits everywhere (the date picker and every DateFormat in Arabic)
  DateFormat.useNativeDigitsByDefaultFor('ar', false);
  final prefs = await SharedPreferences.getInstance();
  // A fresh install (iOS keeps the keychain after the app is deleted) never opens the previous member's account
  final tokens = SecureTokenStore();
  await forgetTokenAfterReinstall(prefs, tokens);
  // Push (FCM): Android reads android/app/google-services.json, iOS lib/firebase_options.dart; on failure push is off
  var firebaseReady = false;
  try {
    await Firebase.initializeApp(options: Platform.isIOS ? iosFirebaseOptions : null);
    firebaseReady = true;
    // Crash reports from release builds only (debug errors stay in the console)
    final crashlytics = FirebaseCrashlytics.instance;
    await crashlytics.setCrashlyticsCollectionEnabled(!kDebugMode);
    FlutterError.onError = crashlytics.recordFlutterFatalError;
    PlatformDispatcher.instance.onError = (error, stack) {
      crashlytics.recordError(error, stack, fatal: true);
      return true;
    };
  } catch (e) {
    debugPrint('[push] Firebase not configured: $e');
  }
  runApp(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        tokenStoreProvider.overrideWithValue(tokens),
        firebaseReadyProvider.overrideWithValue(firebaseReady),
      ],
      child: const NaseebakApp(),
    ),
  );
}
