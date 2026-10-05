import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens the device's map app, falling back to Google Maps in the browser.
Future<bool> openMapCoordinates(double latitude, double longitude) async {
  final coordinates = '$latitude,$longitude';
  final googleMaps = Uri.https('www.google.com', '/maps/search/', {
    'api': '1',
    'query': coordinates,
  });

  if (!kIsWeb) {
    final Uri? nativeMap = switch (defaultTargetPlatform) {
      TargetPlatform.android => Uri.parse('geo:$coordinates?q=$coordinates'),
      TargetPlatform.iOS => Uri.parse('maps://?q=$coordinates'),
      _ => null,
    };
    if (nativeMap != null) {
      try {
        if (await launchUrl(nativeMap, mode: LaunchMode.externalApplication)) {
          return true;
        }
      } catch (_) {
        // A missing or unavailable native handler should not block the fallback.
      }
    }
  }

  try {
    return await launchUrl(
      googleMaps,
      mode: kIsWeb
          ? LaunchMode.platformDefault
          : LaunchMode.externalApplication,
    );
  } catch (_) {
    return false;
  }
}
