import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/providers.dart';
import '../analytics/analytics.dart';

/// The store's own rating sheet (App Store / Google Play), asked once per install at a happy moment: the member's
/// first match. The system decides whether it really shows (Apple: at most 3 times a year; Google: a quota), so it is
/// never a promise and never blocks anything.
class StoreReview {
  StoreReview(this._prefs, this._analytics, {InAppReview? review}) : _review = review ?? InAppReview.instance;

  final SharedPreferences _prefs;
  final AppAnalytics _analytics;
  final InAppReview _review;

  static const askedKey = 'store_review_asked';

  /// After the match dialog closed; the short pause lets the screen it opened settle first
  Future<void> afterFirstMatch({Duration delay = const Duration(seconds: 2)}) async {
    if (_prefs.getBool(askedKey) ?? false) return;
    try {
      if (!await _review.isAvailable()) return;
      await _prefs.setBool(askedKey, true);
      await Future<void>.delayed(delay);
      await _review.requestReview();
      _analytics.log('review_prompt_requested');
    } catch (e) {
      debugPrint('[review] $e');
    }
  }
}

final storeReviewProvider = Provider<StoreReview>(
  (ref) => StoreReview(ref.watch(sharedPreferencesProvider), ref.watch(analyticsProvider)),
);
