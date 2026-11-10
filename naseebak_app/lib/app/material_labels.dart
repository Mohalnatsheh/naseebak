import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

/// Arabic Material labels with one change (QA A2-L9): a screen reader on a dialog's or a sheet's dark backdrop hears
/// «إغلاق», what tapping it does, instead of Flutter's «رفض» and «تمويه».
class AppMaterialLocalizationsDelegate extends LocalizationsDelegate<MaterialLocalizations> {
  const AppMaterialLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => GlobalMaterialLocalizations.delegate.isSupported(locale);

  @override
  Future<MaterialLocalizations> load(Locale locale) {
    // Loads the date data the Arabic labels need, and is the answer for any other language. Synchronous like
    // Flutter's own (a SynchronousFuture's `then` stays synchronous), so the first frame isn't delayed.
    return GlobalMaterialLocalizations.delegate.load(locale).then((base) {
      if (locale.languageCode != 'ar') return base;
      const name = 'ar';
      return _ArabicLabels(
        fullYearFormat: intl.DateFormat.y(name),
        compactDateFormat: intl.DateFormat.yMd(name),
        shortDateFormat: intl.DateFormat.yMMMd(name),
        mediumDateFormat: intl.DateFormat.MMMEd(name),
        longDateFormat: intl.DateFormat.yMMMMEEEEd(name),
        yearMonthFormat: intl.DateFormat.yMMMM(name),
        shortMonthDayFormat: intl.DateFormat.MMMd(name),
        decimalFormat: intl.NumberFormat.decimalPattern(name),
        twoDigitZeroPaddedFormat: intl.NumberFormat('00', name),
      );
    });
  }

  @override
  bool shouldReload(AppMaterialLocalizationsDelegate old) => false;
}

/// What a backdrop says to a screen reader
const backdropLabel = 'إغلاق';

class _ArabicLabels extends MaterialLocalizationAr {
  const _ArabicLabels({
    required super.fullYearFormat,
    required super.compactDateFormat,
    required super.shortDateFormat,
    required super.mediumDateFormat,
    required super.longDateFormat,
    required super.yearMonthFormat,
    required super.shortMonthDayFormat,
    required super.decimalFormat,
    required super.twoDigitZeroPaddedFormat,
  });

  @override
  String get modalBarrierDismissLabel => backdropLabel;

  @override
  String get scrimLabel => backdropLabel;
}
