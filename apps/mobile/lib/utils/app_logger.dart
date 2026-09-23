import 'dart:developer' as developer;
import 'package:flutter/foundation.dart';

/// Minimal structured logging facade over `dart:developer.log`.
///
/// No external dependencies by design: a crash-reporting SDK (Sentry,
/// Crashlytics) can hook into these methods later without touching call
/// sites. Messages surface in `flutter run` console and DevTools.
class AppLogger {
  AppLogger._();

  /// Injectable sink for tests; defaults to `developer.log`.
  static void Function(String message, {Object? error, StackTrace? stack})?
  onLog;

  static void debug(String message, [Object? error, StackTrace? stack]) =>
      _log('DEBUG', message, error, stack);

  static void info(String message, [Object? error, StackTrace? stack]) =>
      _log('INFO', message, error, stack);

  static void warning(String message, [Object? error, StackTrace? stack]) =>
      _log('WARN', message, error, stack);

  static void error(String message, [Object? error, StackTrace? stack]) =>
      _log('ERROR', message, error, stack);

  static void _log(
    String level,
    String message,
    Object? error,
    StackTrace? stack,
  ) {
    final prefixed = '[$level] $message';
    final sink = onLog;
    if (sink != null) {
      sink(prefixed, error: error, stack: stack);
      return;
    }
    developer.log(prefixed, error: error, stackTrace: stack, name: 'agrolens');
    if (kDebugMode) {
      debugPrint(prefixed);
      if (error != null) debugPrint('$error');
      if (stack != null) debugPrint('$stack');
    }
  }
}
