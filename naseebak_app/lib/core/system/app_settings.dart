import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

const _system = MethodChannel('naseebak/system');

/// The app's own page in the phone's settings (permissions: the microphone, photos), via MainActivity / AppDelegate
Future<void> openAppSettingsPage() async {
  try {
    await _system.invokeMethod<void>('openAppSettings');
  } catch (_) {
    // An older native side or no platform (tests): nothing to open
  }
}

/// Tests replace it
final openAppSettingsProvider = Provider<Future<void> Function()>((ref) => openAppSettingsPage);
