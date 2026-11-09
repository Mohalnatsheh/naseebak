package com.naseebak.naseebak_app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    /**
     * A naseebak.com link (App Link) is handled once. Android keeps the intent that created the activity: after the
     * process was killed in the background it recreates the activity with that old link (savedInstanceState set),
     * and a relaunch from recents replays it (FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY). Both would open the old page
     * again (e.g. «عضوية Pro» after every launch), so the link is dropped there and the app opens normally.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        if (intent?.data != null && (savedInstanceState != null || fromHistory(intent))) intent = withoutLink(intent)
        super.onCreate(savedInstanceState)
    }

    /** A link arriving while the app runs: handled by Flutter (the router), then never replayed */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(withoutLink(intent))
    }

    private fun fromHistory(intent: Intent) = (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0

    /** Same intent (push extras kept), opened like the launcher icon */
    private fun withoutLink(intent: Intent) = Intent(intent).apply {
        action = Intent.ACTION_MAIN
        data = null
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "naseebak/system").setMethodCallHandler { call, result ->
            when (call.method) {
                // «فتح الإعدادات» on the notifications-off card (lib/core/push/push_permission.dart)
                "openNotificationSettings" -> {
                    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                    } else {
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
                    }
                    startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    result.success(null)
                }
                // «الإعدادات» after the microphone was refused for good (lib/core/system/app_settings.dart)
                "openAppSettings" -> {
                    startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                    result.success(null)
                }
                // Chats and a match's photos (lib/core/privacy/screen_privacy.dart): no screenshots, no screen
                // recording, blank in the recent-apps preview
                "setSecure" -> {
                    if (call.arguments == true) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    }
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }
}
