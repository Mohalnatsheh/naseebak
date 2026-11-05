import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';

import '../network/api_exception.dart';

/// Errors that are part of normal life on a phone, not bugs: no connection, a timeout, the server unreachable for a
/// moment (e.g. during a deploy). They reach the global handlers when a background call (a refresh, a read mark)
/// doesn't catch its error, and Crashlytics used to file them as fatal crashes (2026-11-04:
/// `ApiException(null, null, تعذّر الاتصال بالخادم…)` from `ApiClient._send`). The member already sees the error
/// message where it matters, so these are not reported.
bool isExpectedError(Object error) {
  if (error is ApiException) return error.isNetwork;
  if (error is DioException) {
    return switch (error.type) {
      DioExceptionType.connectionError ||
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout => true,
      _ => false,
    };
  }
  return error is SocketException || error is TimeoutException || error is HttpException;
}
