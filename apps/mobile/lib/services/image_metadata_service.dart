import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'package:exif/exif.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:xml/xml.dart';

class ImageMetadataService {
  const ImageMetadataService();

  Future<LatLng?> extractLocation(XFile file) async {
    // Only inspect a bounded prefix locally; the server verifies the full original.
    final builder = BytesBuilder(copy: false);
    await for (final chunk in file.openRead(
      0,
      math.min(await file.length(), 512 * 1024),
    )) {
      builder.add(chunk);
    }
    return extractLocationFromBytes(builder.takeBytes());
  }

  Future<LatLng?> extractLocationFromBytes(Uint8List bytes) async {
    final xmlText = utf8.decode(bytes, allowMalformed: true);
    final packet = RegExp(
      r'<(?:[\w-]+:)?xmpmeta\b[\s\S]*?</(?:[\w-]+:)?xmpmeta>',
    ).firstMatch(xmlText)?.group(0);
    if (packet != null) {
      try {
        final document = XmlDocument.parse(packet);
        final values = <String, String>{};
        for (final element in document.descendants.whereType<XmlElement>()) {
          for (final attribute in element.attributes) {
            if (attribute.namespaceUri == 'http://www.uav.com/drone-dji/1.0/') {
              values[attribute.name.local] = attribute.value;
            }
          }
          if (element.namespaceUri == 'http://www.uav.com/drone-dji/1.0/') {
            values[element.name.local] = element.innerText;
          }
        }
        final point = _point(
          double.tryParse(
            values['GpsLatitude'] ??
                values['GPSLatitude'] ??
                values['Latitude'] ??
                '',
          ),
          double.tryParse(
            values['GpsLongitude'] ??
                values['GPSLongitude'] ??
                values['GPSLongtitude'] ??
                values['Longitude'] ??
                '',
          ),
        );
        if (point != null &&
            ![
              'invalid',
              'none',
              'error',
            ].contains(values['GpsStatus']?.toLowerCase())) {
          return point;
        }
      } catch (_) {
        // Malformed XMP must not prevent standard EXIF GPS extraction.
      }
    }
    try {
      final tags = await readExifFromBytes(bytes, details: false);
      if (tags['GPS GPSStatus']?.printable == 'V') return null;
      double? coordinate(String key, String reference, String negative) {
        final values = tags[key]?.values;
        if (values == null || values.toList().length != 3) return null;
        final ref = tags[reference]?.printable;
        if (!(negative == 'S' ? ['N', 'S'] : ['E', 'W']).contains(ref)) {
          return null;
        }
        final parts = values
            .toList()
            .map(
              (value) =>
                  value is Ratio ? value.toDouble() : (value as num).toDouble(),
            )
            .toList();
        if (parts.any((value) => !value.isFinite || value < 0) ||
            parts[1] >= 60 ||
            parts[2] >= 60) {
          return null;
        }
        final result = parts[0] + parts[1] / 60 + parts[2] / 3600;
        return ref == negative ? -result : result;
      }

      return _point(
        coordinate('GPS GPSLatitude', 'GPS GPSLatitudeRef', 'S'),
        coordinate('GPS GPSLongitude', 'GPS GPSLongitudeRef', 'W'),
      );
    } catch (_) {
      return null;
    }
  }

  LatLng? _point(double? latitude, double? longitude) {
    if (latitude == null ||
        longitude == null ||
        !latitude.isFinite ||
        !longitude.isFinite ||
        latitude.abs() > 90 ||
        longitude.abs() > 180) {
      return null;
    }
    return LatLng(latitude, longitude);
  }
}
