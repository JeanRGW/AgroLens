import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/utils/location_defaults.dart';

void main() {
  test('resolveLocationPickerPoint prefers explicit coordinates', () {
    final point = resolveLocationPickerPoint(latitude: -22.9, longitude: -43.1);

    expect(point.latitude, -22.9);
    expect(point.longitude, -43.1);
  });

  test('resolveLocationPickerPoint falls back to Brazil default', () {
    final defaultPoint = resolveLocationPickerPoint();
    expect(defaultPoint.latitude, brazilDefaultCenter.latitude);
    expect(defaultPoint.longitude, brazilDefaultCenter.longitude);
  });

  test('parseCoordinatePair parses valid values and rejects invalid ones', () {
    final point = parseCoordinatePair(' -22.9 ', ' -43.1 ');
    expect(point?.latitude, -22.9);
    expect(point?.longitude, -43.1);
    expect(parseCoordinatePair('abc', '123'), isNull);
  });
}
