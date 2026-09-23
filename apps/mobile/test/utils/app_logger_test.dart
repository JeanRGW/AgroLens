import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/utils/app_logger.dart';

void main() {
  group('AppLogger', () {
    test('routes messages through the injectable sink with level prefixes', () {
      final records = <({String message, Object? error})>[];
      AppLogger.onLog = (message, {error, stack}) =>
          records.add((message: message, error: error));

      addTearDown(() => AppLogger.onLog = null);

      final boom = StateError('boom');
      AppLogger.debug('cache hit');
      AppLogger.info('sync started');
      AppLogger.warning('refresh failed', boom);
      AppLogger.error('sync crashed', boom, StackTrace.current);

      expect(records, hasLength(4));
      expect(records[0].message, '[DEBUG] cache hit');
      expect(records[1].message, '[INFO] sync started');
      expect(records[2].message, '[WARN] refresh failed');
      expect(records[2].error, same(boom));
      expect(records[3].message, '[ERROR] sync crashed');
      expect(records[3].error, same(boom));
    });

    test('tolerates null error and stack', () {
      Object? capturedError;
      AppLogger.onLog = (message, {error, stack}) => capturedError = error;
      addTearDown(() => AppLogger.onLog = null);

      AppLogger.warning('cleanup failed');
      expect(capturedError, isNull);
    });
  });
}
