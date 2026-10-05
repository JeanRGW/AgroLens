import 'package:agrolens/utils/storage_guard.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('memory-only storage cannot be used for offline photos', () {
    expect(() => requireDurableStorage('inMemory'), throwsStateError);
    for (final implementation in [
      'opfsShared',
      'opfsLocks',
      'sharedIndexedDb',
      'unsafeIndexedDb',
    ]) {
      expect(() => requireDurableStorage(implementation), returnsNormally);
    }
  });
}
