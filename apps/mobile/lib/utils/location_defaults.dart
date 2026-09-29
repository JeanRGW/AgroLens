import 'package:latlong2/latlong.dart';

const LatLng brazilDefaultCenter = LatLng(-14.2350, -51.9253);

LatLng resolveLocationPickerPoint({double? latitude, double? longitude}) {
  if (latitude != null && longitude != null) {
    return LatLng(latitude, longitude);
  }
  return brazilDefaultCenter;
}

LatLng? parseCoordinatePair(String? latitude, String? longitude) {
  final parsedLatitude = double.tryParse(latitude?.trim() ?? '');
  final parsedLongitude = double.tryParse(longitude?.trim() ?? '');
  if (parsedLatitude == null || parsedLongitude == null) return null;
  if (!parsedLatitude.isFinite ||
      !parsedLongitude.isFinite ||
      parsedLatitude < -90 ||
      parsedLatitude > 90 ||
      parsedLongitude < -180 ||
      parsedLongitude > 180) {
    return null;
  }
  return LatLng(parsedLatitude, parsedLongitude);
}
