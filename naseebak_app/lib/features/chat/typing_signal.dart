/// «يكتب الآن…»: how often my typing is signalled, and how long the other person's shows.
library;

/// The server shows a signal for 5 s; one every 3 s keeps it on while I type
const typingSendEvery = Duration(seconds: 3);

/// The header shows «يكتب الآن…» this long after the last signal
const typingShowFor = Duration(seconds: 5);

/// At most one `POST /api/chats/{id}/typing` per [every]
class TypingThrottle {
  TypingThrottle({this.every = typingSendEvery, DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final Duration every;
  final DateTime Function() _clock;
  DateTime? _last;

  /// True when a signal may go now (and counts it as sent)
  bool tryNow() {
    final now = _clock();
    final last = _last;
    if (last != null && now.difference(last) < every) return false;
    _last = now;
    return true;
  }

  /// After a send: the next keystroke signals again at once
  void reset() => _last = null;
}
