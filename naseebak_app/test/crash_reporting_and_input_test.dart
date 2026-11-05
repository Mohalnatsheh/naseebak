import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naseebak_app/core/analytics/crash_filter.dart';
import 'package:naseebak_app/core/localization/safe_input_formatter.dart';
import 'package:naseebak_app/core/network/api_exception.dart';

void main() {
  group('crash filter: a lost connection is not a crash', () {
    test('network errors are expected', () {
      expect(isExpectedError(ApiException(kind: ApiErrorKind.network, message: ApiException.networkMessage)), isTrue);
      expect(isExpectedError(DioException(requestOptions: RequestOptions(), type: DioExceptionType.connectionError)), isTrue);
      expect(isExpectedError(DioException(requestOptions: RequestOptions(), type: DioExceptionType.receiveTimeout)), isTrue);
      expect(isExpectedError(const SocketException('down')), isTrue);
      expect(isExpectedError(TimeoutException('slow')), isTrue);
    });
    test('real bugs are still reported', () {
      expect(isExpectedError(ApiException(kind: ApiErrorKind.server, message: 'x', statusCode: 500)), isFalse);
      expect(isExpectedError(DioException(requestOptions: RequestOptions(), type: DioExceptionType.badResponse)), isFalse);
      expect(isExpectedError(StateError('bug')), isFalse);
      expect(isExpectedError(PlatformException(code: 'error')), isFalse);
    });
  });

  group('SafeInputFormatter (SMS code autofill crash)', () {
    final otp = SafeInputFormatter(allowed: RegExp(r'[0-9٠-٩۰-۹]'), maxLength: 6);
    const empty = TextEditingValue.empty;

    test('autofill pastes the whole SMS: 6 digits kept, cursor at the end, composing cleared', () {
      const sms = 'رمز التحقق الخاص بك في نصيبك: 508647';
      const pasted = TextEditingValue(
        text: sms,
        selection: TextSelection.collapsed(offset: sms.length),
        composing: TextRange(start: 0, end: sms.length),
      );
      final r = otp.formatEditUpdate(empty, pasted);
      expect(r.text, '508647');
      expect(r.selection, const TextSelection.collapsed(offset: 6));
      expect(r.composing, TextRange.empty);
    });

    test('more than 6 digits: cut to 6 and the cursor never goes past the end', () {
      final r = otp.formatEditUpdate(empty, const TextEditingValue(text: '12345678', selection: TextSelection.collapsed(offset: 8), composing: TextRange(start: 0, end: 8)));
      expect(r.text, '123456');
      expect(r.selection.extentOffset, lessThanOrEqualTo(6));
      expect(r.composing, TextRange.empty);
    });

    test('Arabic digits are kept (converted later), normal typing is untouched', () {
      final arabic = otp.formatEditUpdate(empty, const TextEditingValue(text: '١٢٣', selection: TextSelection.collapsed(offset: 3)));
      expect(arabic.text, '١٢٣');
      const typed = TextEditingValue(text: '12', selection: TextSelection.collapsed(offset: 2), composing: TextRange(start: 0, end: 2));
      expect(identical(otp.formatEditUpdate(empty, typed), typed), isTrue);
    });

    test('an out-of-range cursor from the keyboard is pulled back inside', () {
      final r = otp.formatEditUpdate(empty, const TextEditingValue(text: '123', selection: TextSelection.collapsed(offset: 6), composing: TextRange(start: 0, end: 6)));
      expect(r.text, '123');
      expect(r.selection.extentOffset, 3);
      expect(r.composing, TextRange.empty);
    });

    test('phone field: + and spaces allowed, editing in the middle keeps the cursor there', () {
      final phone = SafeInputFormatter(allowed: RegExp(r'[0-9٠-٩۰-۹+ ]'), maxLength: 16);
      final r = phone.formatEditUpdate(empty, const TextEditingValue(text: '079-12a34', selection: TextSelection.collapsed(offset: 5)));
      expect(r.text, '0791234');
      expect(r.selection.extentOffset, 4);
    });
  });
}
