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

/// Sign-out clean-up (tests replace it)
final pickerFilesCleanerProvider = Provider<Future<void> Function()>((ref) => () async {
      try {
        await clearPickerFiles(await getTemporaryDirectory());
      } catch (_) {
        // No path provider (tests)
      }
    });
