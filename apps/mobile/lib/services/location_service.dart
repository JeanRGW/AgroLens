import 'dart:async';

import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

/// Exception thrown when device location acquisition fails.
class LocationException implements Exception {
  final String message;
  const LocationException(this.message);

  @override
  String toString() => message;
}

/// Service providing GPS position acquisition and permissions.
class LocationService {
  const LocationService();

  /// Requests permissions and retrieves the current GPS coordinates.
  ///
  /// Throws [LocationException] on disabled service, denied permission,
  /// timeout ([Duration] below), or generic acquisition failure.
  Future<LatLng> getCurrentPosition({
    LocationAccuracy accuracy = LocationAccuracy.best,
    int distanceFilter = 10,
    Duration timeLimit = const Duration(seconds: 15),
  }) async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw const LocationException(
        'Ative o GPS para usar a localização atual.',
      );
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied) {
      throw const LocationException('Permissão de localização negada.');
    }

    if (permission == LocationPermission.deniedForever) {
      throw const LocationException(
        'Permissão de localização negada permanentemente.',
      );
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: accuracy,
          distanceFilter: distanceFilter,
          timeLimit: timeLimit,
        ),
      );
      return LatLng(position.latitude, position.longitude);
    } on TimeoutException {
      throw const LocationException(
        'Tempo limite ao obter sua localização. Informe as coordenadas manualmente.',
      );
    }
  }
}
