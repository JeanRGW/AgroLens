import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/utils/location_defaults.dart';

void main() {
  test('parseCoordinatePair parses valid values and rejects invalid ones', () {
    final point = parseCoordinatePair(' -22.9 ', ' -43.1 ');
    expect(point?.latitude, -22.9);
    expect(point?.longitude, -43.1);
    expect(parseCoordinatePair('abc', '123'), isNull);
    expect(parseCoordinatePair('91', '0'), isNull);
    expect(parseCoordinatePair('0', '-181'), isNull);
    expect(parseCoordinatePair('NaN', '10'), isNull);
    expect(parseCoordinatePair('0', '0')?.latitude, 0);
    expect(parseCoordinatePair('0', '0')?.longitude, 0);
  });
}
