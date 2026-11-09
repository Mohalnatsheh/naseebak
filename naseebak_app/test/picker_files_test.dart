import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/auth/auth_controller.dart';
import 'package:naseebak_app/core/storage/picker_files.dart';
import 'package:naseebak_app/core/storage/token_store.dart';
import 'package:naseebak_app/features/chat/chat_cache.dart';
import 'package:naseebak_app/features/chat/chat_drafts.dart';

import 'helpers/fake_api.dart';

void main() {
  late Directory tmp;
  setUp(() => tmp = Directory.systemTemp.createTempSync('picker_files_test'));
  tearDown(() {
    if (tmp.existsSync()) tmp.deleteSync(recursive: true);
  });

  test('sign-out clean-up: the picker copies go (iOS and Android shapes), everything else stays', () async {
    final ios = File('${tmp.path}/image_picker_98FA1B2C.jpg')..writeAsBytesSync([1]);
    final scaled = File('${tmp.path}/scaled_photo.jpg')..writeAsBytesSync([1]);
    final uuid = Directory('${tmp.path}/123e4567-e89b-12d3-a456-426614174000')..createSync();
    File('${uuid.path}/IMG_1.jpg').writeAsBytesSync([1]);
    final voice = File('${tmp.path}/voice-1.m4a')..writeAsBytesSync([1]);
    final chatCache = Directory('${tmp.path}/chat_cache')..createSync();
    final otherUuid = Directory('${tmp.path}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')..createSync();
    File('${otherUuid.path}/data.bin').writeAsBytesSync([1]);

    await clearPickerFiles(tmp);
    expect(ios.existsSync(), isFalse);
    expect(scaled.existsSync(), isFalse);
    expect(uuid.existsSync(), isFalse);
    expect(voice.existsSync(), isTrue);
    expect(chatCache.existsSync(), isTrue);
    // A folder that isn't only photos is someone else's
    expect(otherUuid.existsSync(), isTrue);
  });

  test('one uploaded photo: the file, and its Android folder once empty', () {
    final uuid = Directory('${tmp.path}/123e4567-e89b-12d3-a456-426614174000')..createSync();
    final f = File('${uuid.path}/IMG_1.jpg')..writeAsBytesSync([1]);
    deletePickedFile(f.path);
    expect(f.existsSync(), isFalse);
    expect(uuid.existsSync(), isFalse);
    final plain = File('${tmp.path}/image_picker_X.jpg')..writeAsBytesSync([1]);
    deletePickedFile(plain.path);
    expect(plain.existsSync(), isFalse);
    expect(tmp.existsSync(), isTrue);
  });

  test('sign-out wipes chat drafts and the picker copies', () async {
    var cleaned = 0;
    final adapter = FakeAdapter()
      ..on('GET', '/api/mobile/me', FakeResponse(200, {'user': meJson()}))
      ..on('POST', '/api/mobile/auth/logout', const FakeResponse(200, {'ok': true}));
    final c = ProviderContainer(overrides: [
      ...await testOverrides(adapter, store: MemoryTokenStore('t1')),
      chatCacheProvider.overrideWithValue(MemoryChatCache()),
      pickerFilesCleanerProvider.overrideWithValue(() async => cleaned++),
    ]);
    addTearDown(c.dispose);
    c.read(authControllerProvider);
    for (var i = 0; i < 50 && !c.read(authControllerProvider).isSignedIn; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    await c.read(chatDraftsProvider).write('u1', 'c1', 'مسودة');
    await c.read(authControllerProvider.notifier).logout();
    expect(cleaned, 1);
    expect(c.read(chatDraftsProvider).read('u1', 'c1'), isNull);
  });
}
