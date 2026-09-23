import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geolocator_platform_interface/geolocator_platform_interface.dart';
import 'package:agrolens/services/location_service.dart';

/// Fake Geolocator platform implementation for unit tests.
class _FakeGeolocator extends GeolocatorPlatform {
  _FakeGeolocator({
    this.serviceEnabled = true,
    this.permission = LocationPermission.whileInUse,
    this.position,
    this.getCurrentError,
  });

  final bool serviceEnabled;
  final LocationPermission permission;
  final Position? position;
  final Object? getCurrentError;

  int getCurrentCalls = 0;
  Duration? capturedTimeLimit;

  @override
  Future<bool> isLocationServiceEnabled() async => serviceEnabled;

  @override
  Future<LocationPermission> checkPermission() async => permission;

  @override
  Future<LocationPermission> requestPermission() async => permission;

  @override
  Future<Position> getCurrentPosition({
    LocationSettings? locationSettings,
  }) async {
    getCurrentCalls++;
    capturedTimeLimit = locationSettings?.timeLimit;
    if (getCurrentError != null) {
      throw getCurrentError!;
    }
    return position!;
  }
}

Position _fakePosition() => Position(
  latitude: -22.9,
  longitude: -43.1,
  timestamp: DateTime.now(),
  accuracy: 5,
  altitude: 100,
  altitudeAccuracy: 0,
  heading: 0,
  headingAccuracy: 0,
  speed: 0,
  speedAccuracy: 0,
);

void main() {
  test('returns coordinates when a fix arrives in time', () async {
    final fake = _FakeGeolocator(position: _fakePosition());
    GeolocatorPlatform.instance = fake;

    final service = const LocationService();
    final point = await service.getCurrentPosition();

    expect(point.latitude, -22.9);
    expect(point.longitude, -43.1);
    expect(fake.capturedTimeLimit, const Duration(seconds: 15));
  });

  test('respects a custom timeLimit', () async {
    final fake = _FakeGeolocator(position: _fakePosition());
    GeolocatorPlatform.instance = fake;

    await const LocationService().getCurrentPosition(
      timeLimit: const Duration(seconds: 5),
    );

    expect(fake.capturedTimeLimit, const Duration(seconds: 5));
  });

  test(
    'maps GPS timeout to a LocationException with a friendly message',
    () async {
      final fake = _FakeGeolocator(
        getCurrentError: TimeoutException('Timed out'),
      );
      GeolocatorPlatform.instance = fake;

      await expectLater(
        const LocationService().getCurrentPosition(),
        throwsA(
          isA<LocationException>().having(
            (e) => e.message,
            'message',
            'Tempo limite ao obter sua localização. Informe as coordenadas manualmente.',
          ),
        ),
      );
    },
  );

  test('throws when location service is disabled', () async {
    GeolocatorPlatform.instance = _FakeGeolocator(serviceEnabled: false);

    await expectLater(
      const LocationService().getCurrentPosition(),
      throwsA(
        isA<LocationException>().having(
          (e) => e.message,
          'message',
          'Ative o GPS para usar a localização atual.',
        ),
      ),
    );
  });

  test('throws when permission is denied', () async {
    GeolocatorPlatform.instance = _FakeGeolocator(
      permission: LocationPermission.denied,
    );

    await expectLater(
      const LocationService().getCurrentPosition(),
      throwsA(
        isA<LocationException>().having(
          (e) => e.message,
          'message',
          'Permissão de localização negada.',
        ),
      ),
    );
  });

  test('throws when permission is denied forever', () async {
    GeolocatorPlatform.instance = _FakeGeolocator(
      permission: LocationPermission.deniedForever,
    );

    await expectLater(
      const LocationService().getCurrentPosition(),
      throwsA(
        isA<LocationException>().having(
          (e) => e.message,
          'message',
          'Permissão de localização negada permanentemente.',
        ),
      ),
    );
  });
}
