import 'package:flutter_riverpod/flutter_riverpod.dart';

/// How many of the app's own popups are open or about to open: the admin popup (from the moment `AlertGate` asks the
/// server until it is closed) and the match dialog. The daily notifications reminder waits while any is (review I-2),
/// so the two never stack.
class PopupTracker extends Notifier<int> {
  @override
  int build() => 0;

  void open() => state = state + 1;

  void close() => state = state > 0 ? state - 1 : 0;

  /// Counts [show] as a popup until it completes, whatever happens to the widget that opened it
  Future<T> track<T>(Future<T> Function() show) async {
    open();
    try {
      return await show();
    } finally {
      close();
    }
  }
}

final popupShowingProvider = NotifierProvider<PopupTracker, int>(PopupTracker.new);
