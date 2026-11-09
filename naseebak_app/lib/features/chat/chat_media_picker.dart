import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

/// The largest photo the app sends (the server refuses bigger ones too)
const maxChatPhotoBytes = 10 * 1024 * 1024;

/// A photo picked for the chat: a local file and its size.
class PickedPhoto {
  const PickedPhoto({required this.path, required this.bytes});
  final String path;
  final int bytes;
}

typedef PhotoPicker = Future<PickedPhoto?> Function();

/// Opens the gallery (tests replace it). 2048 px at quality 85 makes iOS write JPEG, so HEIC arrives as JPEG.
final chatPhotoPickerProvider = Provider<PhotoPicker>(
  (ref) => () async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 85,
    );
    if (file == null) return null;
    return PickedPhoto(path: file.path, bytes: await file.length());
  },
);
