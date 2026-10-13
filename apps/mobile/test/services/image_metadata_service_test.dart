import 'dart:convert';
import 'dart:typed_data';
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:agrolens/utils/image_naming.dart';
import 'package:agrolens/services/image_metadata_service.dart';
import 'package:agrolens/models/pending_upload.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const service = ImageMetadataService();
  const samples = String.fromEnvironment('DRONE_SAMPLE_DIR');
  const expectationsPath = String.fromEnvironment('DRONE_SAMPLE_EXPECTATIONS');
  Uint8List packet(String attributes) => Uint8List.fromList(
    utf8.encode(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dji="http://www.uav.com/drone-dji/1.0/" $attributes/></rdf:RDF></x:xmpmeta>',
    ),
  );

  test('reads signed DJI coordinates by namespace, not XML prefix', () async {
    final point = await service.extractLocationFromBytes(
      packet('dji:GpsLatitude="-25.4" dji:GpsLongitude="-51.4"'),
    );
    expect(point?.latitude, -25.4);
    expect(point?.longitude, -51.4);
  });

  test(
    'zero coordinates are valid but incomplete or invalid pairs are not',
    () async {
      final point = await service.extractLocationFromBytes(
        packet('dji:GPSLatitude="0" dji:GPSLongtitude="0"'),
      );
      expect(point?.latitude, 0);
      expect(point?.longitude, 0);
      expect(
        await service.extractLocationFromBytes(
          packet('dji:GpsLatitude="91" dji:GpsLongitude="0"'),
        ),
        isNull,
      );
      expect(
        await service.extractLocationFromBytes(packet('dji:GpsLatitude="1"')),
        isNull,
      );
    },
  );

  test('malformed metadata is nonfatal', () async {
    expect(
      await service.extractLocationFromBytes(Uint8List.fromList([1, 2, 3])),
      isNull,
    );
  });

  test(
    'reads standard TIFF EXIF GPS rationals with hemisphere references',
    () async {
      final bytes = Uint8List(128);
      final data = ByteData.sublistView(bytes);
      bytes.setRange(0, 4, [0x49, 0x49, 0x2a, 0]);
      data.setUint32(4, 8, Endian.little);
      data.setUint16(8, 1, Endian.little);
      void entry(int offset, int tag, int type, int count, int value) {
        data.setUint16(offset, tag, Endian.little);
        data.setUint16(offset + 2, type, Endian.little);
        data.setUint32(offset + 4, count, Endian.little);
        data.setUint32(offset + 8, value, Endian.little);
      }

      entry(10, 0x8825, 4, 1, 26);
      data.setUint16(26, 4, Endian.little);
      entry(28, 1, 2, 2, 'S'.codeUnitAt(0));
      entry(40, 2, 5, 3, 80);
      entry(52, 3, 2, 2, 'W'.codeUnitAt(0));
      entry(64, 4, 5, 3, 104);
      for (var i = 0; i < 6; i++) {
        data.setUint32(80 + i * 8, [25, 24, 0, 51, 24, 0][i], Endian.little);
        data.setUint32(84 + i * 8, 1, Endian.little);
      }
      final point = await service.extractLocationFromBytes(bytes);
      expect(point?.latitude, -25.4);
      expect(point?.longitude, -51.4);
      data.setUint32(36, 'W'.codeUnitAt(0), Endian.little);
      expect(await service.extractLocationFromBytes(bytes), isNull);
    },
  );

  test(
    'public samples pass bounded mobile extraction and byte-based format detection',
    () async {
      final images = Directory(samples)
          .listSync()
          .whereType<File>()
          .where(
            (entry) => RegExp(
              r'\.(jpe?g|png|webp|tiff?|dng)$',
              caseSensitive: false,
            ).hasMatch(entry.path),
          )
          .toList();
      expect(images, isNotEmpty);
      final expectations = expectationsPath.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(File(expectationsPath).readAsStringSync())
                as Map<String, dynamic>;
      for (final entry in images) {
        final name = entry.uri.pathSegments.last;
        final file = XFile(entry.path);
        if (name.endsWith('.dng') || name.endsWith('.TIF')) {
          await expectLater(imageExtension(file), throwsFormatException);
          continue;
        }
        final point = await service.extractLocation(file);
        if (name.startsWith('m4t-')) {
          expect(point, isNull, reason: name);
          expect(await imageExtension(file), '.jpg');
        } else {
          expect(point, isNotNull, reason: name);
          expect(await imageExtension(file), '.jpg');
          if (expectationsPath.isNotEmpty) {
            final expected = expectations[name] as Map<String, dynamic>;
            expect(
              point!.latitude,
              closeTo((expected['latitude'] as num).toDouble(), 0.00001),
              reason: name,
            );
            expect(
              point.longitude,
              closeTo((expected['longitude'] as num).toDouble(), 0.00001),
              reason: name,
            );
          }
        }
      }
    },
    skip: samples.isEmpty,
  );

  test('location provenance survives an offline JSON roundtrip', () {
    for (final source in ['file', 'device', 'manual', 'none']) {
      final image = PendingImage(
        path: 'image.jpg',
        locationSource: source,
        latitude: source == 'none' ? null : -25.4,
        longitude: source == 'none' ? null : -51.4,
      );
      final restored = PendingImage.fromJson(image.toJson());
      expect(restored.locationSource, source);
      expect(restored.latitude, image.latitude);
    }
  });
  test(
    'pre-feature drafts keep their coordinates without inventing provenance',
    () {
      final image = PendingImage.fromJson({
        'imageId': 'old',
        'path': 'photo.jpg',
        'origin': 'gallery',
        'latitude': 1,
        'longitude': 2,
      });
      expect(image.latitude, 1);
      expect(image.longitude, 2);
      expect(image.locationSource, isNull);
    },
  );
}
