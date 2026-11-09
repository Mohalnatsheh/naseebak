import 'dart:io';

import 'package:flutter/material.dart';

import '../../core/privacy/screen_privacy.dart';
import '../../core/theme/app_theme.dart';

/// The picked photo, full screen on black, before it is sent: «إرسال» returns true, «إلغاء» (or back) false. Nothing
/// is uploaded until «إرسال».
class PhotoPreviewScreen extends StatelessWidget {
  const PhotoPreviewScreen({super.key, required this.path});
  final String path;

  /// Pushes the preview; true only when «إرسال» was tapped
  static Future<bool> confirm(BuildContext context, String path) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => PhotoPreviewScreen(path: path)),
    );
    return ok ?? false;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SecureArea(
        child: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: InteractiveViewer(
                  maxScale: 4,
                  child: Center(
                    child: Image.file(
                      File(path),
                      key: const Key('photo-preview-image'),
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) =>
                          const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        key: const Key('photo-preview-cancel'),
                        onPressed: () => Navigator.of(context).pop(false),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white54),
                          minimumSize: const Size.fromHeight(48),
                        ),
                        child: const Text('إلغاء'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton.icon(
                        key: const Key('photo-preview-send'),
                        onPressed: () => Navigator.of(context).pop(true),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.navy,
                          minimumSize: const Size.fromHeight(48),
                        ),
                        icon: const Icon(Icons.send_rounded, size: 18),
                        label: const Text('إرسال'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
