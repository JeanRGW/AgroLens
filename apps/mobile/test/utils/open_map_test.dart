import 'package:agrolens/utils/open_map.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('plugins.flutter.io/url_launcher');
  late List<Uri> launchedUrls;
  late bool nativeAvailable;
  late bool browserAvailable;
  late bool nativeThrows;

  setUp(() {
    launchedUrls = [];
    nativeAvailable = true;
    browserAvailable = true;
    nativeThrows = false;
    binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      expect(call.method, 'launch');
      final uri = Uri.parse((call.arguments as Map)['url'] as String);
      launchedUrls.add(uri);
      if (uri.scheme == 'https') return browserAvailable;
      if (nativeThrows) throw PlatformException(code: 'no_map_app');
      return nativeAvailable;
    });
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null);
  });

  test('Android opens a geo URI in a map app', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(await openMapCoordinates(-22.123456, -47.654321), isTrue);
    expect(launchedUrls.single.scheme, 'geo');
    expect(launchedUrls.single.path, '-22.123456,-47.654321');
    expect(launchedUrls.single.queryParameters['q'], '-22.123456,-47.654321');
  });

  test('iOS opens the Maps app', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(await openMapCoordinates(0, 0), isTrue);
    expect(launchedUrls.single.scheme, 'maps');
    expect(launchedUrls.single.queryParameters['q'], '0.0,0.0');
  });

  test('missing native map app falls back to Google Maps', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    nativeAvailable = false;
    expect(await openMapCoordinates(-22.123456, -47.654321), isTrue);
    expect(launchedUrls, hasLength(2));
    expect(launchedUrls.last.host, 'www.google.com');
    expect(launchedUrls.last.path, '/maps/search/');
    expect(launchedUrls.last.queryParameters['api'], '1');
    expect(launchedUrls.last.queryParameters['query'], '-22.123456,-47.654321');
  });

  test('native launch exception still falls back to Google Maps', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    nativeThrows = true;
    expect(await openMapCoordinates(10, 20), isTrue);
    expect(launchedUrls, hasLength(2));
    expect(launchedUrls.last.scheme, 'https');
  });

  test('returns false if neither the map app nor browser opens', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    nativeAvailable = false;
    browserAvailable = false;
    expect(await openMapCoordinates(10, 20), isFalse);
  });

  test('desktop goes directly to Google Maps', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.linux;
    expect(await openMapCoordinates(10, 20), isTrue);
    expect(launchedUrls.single.host, 'www.google.com');
  });
}
