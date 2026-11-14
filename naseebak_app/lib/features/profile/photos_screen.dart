import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/providers.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/media_url.dart';
import '../../core/storage/picker_files.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/brand_kit.dart';
import '../../shared/widgets/common.dart';
import 'profile_repository.dart';

const maxPhotos = 5;
const maxPhotoBytes = 5 * 1024 * 1024;

/// A `data:` URL for `POST /api/profile/photos` from the picked bytes, or null when the format isn't
/// JPEG / PNG / WebP (the only ones the server takes).
String? photoDataUrl(Uint8List bytes) {
  String? mime;
  if (bytes.length > 3 && bytes[0] == 0xFF && bytes[1] == 0xD8) {
    mime = 'image/jpeg';
  } else if (bytes.length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) {
    mime = 'image/png';
  } else if (bytes.length > 12 &&
      ascii.decode(bytes.sublist(0, 4), allowInvalid: true) == 'RIFF' &&
      ascii.decode(bytes.sublist(8, 12), allowInvalid: true) == 'WEBP') {
    mime = 'image/webp';
  }
  return mime == null ? null : 'data:$mime;base64,${base64Encode(bytes)}';
}

final myPhotosProvider = FutureProvider.autoDispose<List<MyPhoto>>((ref) => ref.watch(profileRepositoryProvider).photos());

/// «صوري»: up to 5 photos, one main. Nobody sees them clearly before a mutual match; before it, suggested members
/// see only a strongly blurred tiny copy of the main photo (`photoPreview`, made on the server).
class PhotosScreen extends ConsumerStatefulWidget {
  const PhotosScreen({super.key, this.picker});

  /// Tests inject a picker
  final Future<Uint8List?> Function()? picker;

  @override
  ConsumerState<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends ConsumerState<PhotosScreen> {
  bool _busy = false;

  Future<Uint8List?> _pick() async {
    if (widget.picker != null) return widget.picker!();
    // Re-encoded smaller on the device, like the website's compressImage()
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, maxHeight: 1600, imageQuality: 82);
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    // Read into memory: the picker's copy of the photo isn't left on the phone
    deletePickedFile(file.path);
    return bytes;
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await action();
      container.invalidate(myPhotosProvider);
      if (mounted) showSnack(context, done);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _add() async {
    final Uint8List? bytes;
    try {
      bytes = await _pick();
    } catch (_) {
      if (mounted) showSnack(context, 'تعذّر فتح الصور. يُرجى التحقق من إذن الوصول إلى الصور');
      return;
    }
    if (bytes == null || !mounted) return;
    if (bytes.length > maxPhotoBytes) {
      showSnack(context, 'حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
      return;
    }
    final data = photoDataUrl(bytes);
    if (data == null) {
      showSnack(context, 'صيغة الصورة غير مدعومة. يرجى استخدام JPG أو PNG أو WebP');
      return;
    }
    await _run(() => ref.read(profileRepositoryProvider).uploadPhoto(data), 'تم رفع الصورة');
  }

  Future<void> _delete(MyPhoto p) async {
    final ok = await confirmDialog(context,
        title: 'حذف الصورة؟', body: 'ستُحذف هذه الصورة من ملفك.', confirmLabel: 'حذف', destructive: true);
    if (ok) await _run(() => ref.read(profileRepositoryProvider).deletePhoto(p.id), 'تم حذف الصورة');
  }

  @override
  Widget build(BuildContext context) {
    final photos = ref.watch(myPhotosProvider);
    final base = ref.watch(apiBaseUrlProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('صوري')),
      body: photos.when(
        loading: () => const SkeletonList(count: 2, itemHeight: 180),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(myPhotosProvider)),
        data: (list) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const InfoBanner(
              icon: Icons.lock_outline_rounded,
              text: 'لا تظهر صورك بوضوح إلا بعد توافق متبادل. قبل التوافق تظهر لمن تُقترح عليهم نسخة ضبابية جداً من صورتك الرئيسية. الصورة الرئيسية هي أول ما يُرى.',
            ),
            if (list.isEmpty) ...[
              const SizedBox(height: 12),
              const Center(child: LineArt(LineArtKind.window)),
            ],
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 0.78,
              children: [
                for (final p in list) _PhotoTile(
                  photo: p,
                  url: resolveMediaUrl(base, p.url),
                  busy: _busy,
                  onMain: () => _run(() => ref.read(profileRepositoryProvider).setMainPhoto(p.id), 'أصبحت الصورة الرئيسية'),
                  onDelete: () => _delete(p),
                ),
                if (list.length < maxPhotos)
                  InkWell(
                    key: const Key('add-photo'),
                    borderRadius: BorderRadius.circular(16),
                    onTap: _busy ? null : _add,
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.gold, width: 1.5),
                        color: AppColors.gold.withValues(alpha: 0.06),
                      ),
                      alignment: Alignment.center,
                      child: _busy
                          ? const CircularProgressIndicator()
                          : const Column(mainAxisSize: MainAxisSize.min, children: [
                              Icon(Icons.add_a_photo_outlined, color: AppColors.navy, size: 34),
                              SizedBox(height: 8),
                              Text('إضافة صورة', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.navy)),
                            ]),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Text('${list.length} من $maxPhotos صور', style: const TextStyle(color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({required this.photo, required this.url, required this.busy, required this.onMain, required this.onDelete});
  final MyPhoto photo;
  final String url;
  final bool busy;
  final VoidCallback onMain;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.network(
            url,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => Container(
              color: AppColors.line,
              alignment: Alignment.center,
              child: const Icon(Icons.broken_image_outlined, color: AppColors.muted),
            ),
          ),
          if (photo.isPrimary)
            PositionedDirectional(
              top: 8,
              start: 8,
              child: DecoratedBox(
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                child: const Pill(text: 'الرئيسية', icon: Icons.star_rounded, color: AppColors.gold),
              ),
            ),
          PositionedDirectional(
            top: 0,
            end: 0,
            // A 48 pt target around the small white dot (QA A-L13: about 30 pt)
            child: PopupMenuButton<String>(
              key: const Key('photo-menu'),
              tooltip: 'خيارات الصورة',
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 140),
              style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
              enabled: !busy,
              icon: const CircleAvatar(radius: 16, backgroundColor: Colors.white, child: Icon(Icons.more_vert, size: 18, color: AppColors.navy)),
              onSelected: (v) => v == 'main' ? onMain() : onDelete(),
              itemBuilder: (_) => [
                if (!photo.isPrimary) const PopupMenuItem(value: 'main', child: Text('اجعلها الرئيسية')),
                const PopupMenuItem(value: 'delete', child: Text('حذف', style: TextStyle(color: AppColors.danger))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
