import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:agrolens/services/connectivity_monitor.dart';

void main() {
  group('ConnectivityMonitor', () {
    test('ignores an initial connectivity result after stop', () async {
      final result = Completer<List<ConnectivityResult>>();
      final monitor = ConnectivityMonitor(
        connectivityChanges: const Stream.empty(),
        checkConnectivity: () => result.future,
      );
      final states = <bool>[];
      final subscription = monitor.connectionStatus.listen(states.add);
      monitor.start(
        onOnline: () => fail('stopped monitor must not restart sync'),
      );
      monitor.stop();
      result.complete([ConnectivityResult.wifi]);
      await Future<void>.delayed(Duration.zero);
      expect(states, isEmpty);
      await subscription.cancel();
      monitor.dispose();
    });

    test('hasInternet bearer matrix', () {
      final monitor = ConnectivityMonitor(
        connectivityChanges: const Stream.empty(),
        checkConnectivity: () async => [ConnectivityResult.none],
      );

      expect(monitor.hasInternet([]), isFalse);
      expect(monitor.hasInternet([ConnectivityResult.none]), isFalse);
      expect(monitor.hasInternet([ConnectivityResult.wifi]), isTrue);
      expect(monitor.hasInternet([ConnectivityResult.mobile]), isTrue);
      expect(monitor.hasInternet([ConnectivityResult.ethernet]), isTrue);
      expect(monitor.hasInternet([ConnectivityResult.vpn]), isTrue);
      // bluetooth/other alone carry no internet guarantee.
      expect(monitor.hasInternet([ConnectivityResult.bluetooth]), isFalse);
      expect(monitor.hasInternet([ConnectivityResult.other]), isFalse);
      expect(
        monitor.hasInternet([
          ConnectivityResult.bluetooth,
          ConnectivityResult.mobile,
        ]),
        isTrue,
      );
    });

    test('emits initial offline state when offline at startup', () async {
      final states = <bool>[];
      final monitor = ConnectivityMonitor(
        connectivityChanges: const Stream.empty(),
        checkConnectivity: () async => [ConnectivityResult.none],
      );
      final sub = monitor.connectionStatus.listen(states.add);

      monitor.start(onOnline: () => fail('onOnline must not fire offline'));
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);

      expect(states, [false]);
      await sub.cancel();
      monitor.dispose();
    });

    test('emits initial online state and fires onOnline when online', () async {
      final states = <bool>[];
      var onlineCalls = 0;
      final monitor = ConnectivityMonitor(
        connectivityChanges: const Stream.empty(),
        checkConnectivity: () async => [ConnectivityResult.wifi],
      );
      final sub = monitor.connectionStatus.listen(states.add);

      monitor.start(onOnline: () => onlineCalls++);
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);

      expect(states, [true]);
      expect(onlineCalls, 1);
      await sub.cancel();
      monitor.dispose();
    });

    test(
      'debounces online events and skips offline-triggered onOnline',
      () async {
        final states = <bool>[];
        var onlineCalls = 0;
        final controller =
            StreamController<List<ConnectivityResult>>.broadcast();
        final monitor = ConnectivityMonitor(
          connectivityChanges: controller.stream,
          checkConnectivity: () async => [ConnectivityResult.none],
          debounceDuration: const Duration(milliseconds: 10),
        );
        final sub = monitor.connectionStatus.listen(states.add);

        monitor.start(onOnline: () => onlineCalls++);
        await Future<void>.delayed(Duration.zero);

        controller.add([ConnectivityResult.none]);
        controller.add([ConnectivityResult.mobile]);
        controller.add([ConnectivityResult.wifi]);
        await Future<void>.delayed(const Duration(milliseconds: 50));

        expect(states, contains(false));
        expect(states, contains(true));
        expect(onlineCalls, 1);

        await controller.close();
        await sub.cancel();
        monitor.dispose();
      },
    );

    test('stop and restart re-checks initial connectivity', () async {
      var checkCalls = 0;
      final monitor = ConnectivityMonitor(
        connectivityChanges: const Stream.empty(),
        checkConnectivity: () async {
          checkCalls++;
          return [ConnectivityResult.wifi];
        },
      );

      monitor.start(onOnline: () {});
      await Future<void>.delayed(Duration.zero);
      expect(checkCalls, 1);

      monitor.stop();
      monitor.start(onOnline: () {});
      await Future<void>.delayed(Duration.zero);
      expect(checkCalls, 2);

      monitor.dispose();
    });

    test('dispose is idempotent and stops emitting', () async {
      final monitor = ConnectivityMonitor(
        connectivityChanges: const Stream.empty(),
        checkConnectivity: () async => [ConnectivityResult.wifi],
      );

      monitor.start(onOnline: () {});
      await Future<void>.delayed(Duration.zero);
      monitor.dispose();
      monitor.dispose();

      expect(monitor.connectionStatus, emitsDone);
    });
  });
}
