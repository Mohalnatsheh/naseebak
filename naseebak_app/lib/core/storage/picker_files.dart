import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

/// Copies the photo picker leaves in the app's temporary folder: iOS `tmp/image_picker_<id>.jpg`, Android
/// `cache/<uuid>/<name>` and `cache/scaled_<name>`. They are private photos: deleted after the upload and on sign-out.
final _uuid = RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');
final _image = RegExp(r'\.(jpe?g|png|heic|heif|webp|gif)$', caseSensitive: false);

bool isPickerFileName(String name) => name.startsWith('image_picker') || name.startsWith('scaled_');

String _name(String path) => path.split(Platform.pathSeparator).last;

/// One picked photo, once uploaded: the file, and Android's `<uuid>` folder around it when nothing else is left there
void deletePickedFile(String path) {
  try {
    final f = File(path);
    if (f.existsSync()) f.deleteSync();
    final dir = f.parent;
    if (_uuid.hasMatch(_name(dir.path)) && dir.existsSync() && dir.listSync().isEmpty) dir.deleteSync();
  } catch (_) {}
}

/// Every picker copy in [tmp] (sign-out). A `<uuid>` folder goes only when it holds nothing but photos.
Future<void> clearPickerFiles(Directory tmp) async {
  try {
    if (!tmp.existsSync()) return;
    for (final e in tmp.listSync()) {
      final name = _name(e.path);
      if (e is File && isPickerFileName(name) && _image.hasMatch(name)) {
        e.deleteSync();
      } else if (e is Directory && _uuid.hasMatch(name)) {
        final inside = e.listSync();
        if (inside.every((x) => x is File && _image.hasMatch(_name(x.path)))) e.deleteSync(recursive: true);
      }
    }
  } catch (_) {}
}

/// Voice notes recorded in the chat (`voice-<time>.m4a`, `voice_recorder.dart`). One is left behind when the app is
/// killed mid-recording or with a note still sending or failed; they are private too. Swept on sign-out and at
/// start (nothing is recording or sending then).
final _voiceNote = RegExp(r'^voice-\d+\.m4a$');

bool isVoiceNoteName(String name) => _voiceNote.hasMatch(name);

Future<void> clearVoiceFiles(Directory tmp) async {
  try {
    if (!tmp.existsSync()) return;
    for (final e in tmp.listSync()) {
      if (e is File && isVoiceNoteName(_name(e.path))) e.deleteSync();
    }
  } catch (_) {}
}

/// Sign-out clean-up: the photo picker's copies and the voice notes (tests replace it)
final pickerFilesCleanerProvider = Provider<Future<void> Function()>((ref) => () async {
      try {
        final tmp = await getTemporaryDirectory();
        await clearPickerFiles(tmp);
        await clearVoiceFiles(tmp);
      } catch (_) {
        // No path provider (tests)
      }
    });

/// At start: voice notes left by a previous run (killed while recording or sending)
Future<void> sweepVoiceFilesAtStart() async {
  try {
    await clearVoiceFiles(await getTemporaryDirectory());
  } catch (_) {}
}
