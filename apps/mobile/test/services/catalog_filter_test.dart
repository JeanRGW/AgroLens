import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/models/catalog.dart';
import 'package:agrolens/models/upload_response.dart';

void main() {
  group('Catalog filtering logic (upload form)', () {
    final properties = [
      Property(
        id: 'prop-1',
        name: 'Fazenda Boa Vista',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        owner: 'João',
        address: 'Rua 1',
        latitude: -22.9,
        longitude: -43.1,
      ),
      Property(
        id: 'prop-2',
        name: 'Sítio São João',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        owner: 'Maria',
        address: 'Rua 2',
        latitude: -23.0,
        longitude: -44.0,
      ),
    ];

    final talhoes = [
      Talhao(
        id: 'talhao-1',
        name: 'Talhão A',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        propertyId: 'prop-1',
      ),
      Talhao(
        id: 'talhao-2',
        name: 'Talhão B',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        propertyId: 'prop-1',
      ),
      Talhao(
        id: 'talhao-3',
        name: 'Talhão C',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        propertyId: 'prop-2',
      ),
    ];

    final cropTypes = [
      CropType(
        id: 'crop-1',
        name: 'Soja',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
      ),
      CropType(
        id: 'crop-2',
        name: 'Milho',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
      ),
    ];

    final estadios = [
      Estadio(
        id: 'estadio-1',
        name: 'VEG',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        cropTypeId: 'crop-1',
      ),
      Estadio(
        id: 'estadio-2',
        name: 'FLOR',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        cropTypeId: 'crop-1',
      ),
      Estadio(
        id: 'estadio-3',
        name: 'GRÃ',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        cropTypeId: 'crop-2',
      ),
    ];

    test('filterTalhoes returns all talhoes when no property selected', () {
      const selectedProperty = null;
      final filtered = selectedProperty == null
          ? talhoes
          : talhoes.where((t) => t.propertyId == selectedProperty.id).toList();
      expect(filtered.length, 3);
    });

    test(
      'filterTalhoes returns only talhoes matching the selected property',
      () {
        final selectedProperty = properties[0]; // Fazenda Boa Vista (prop-1)

        final filtered = talhoes
            .where((t) => t.propertyId == selectedProperty.id)
            .toList();

        expect(filtered.length, 2);
        expect(filtered[0].id, 'talhao-1');
        expect(filtered[1].id, 'talhao-2');
        expect(filtered.every((t) => t.propertyId == 'prop-1'), isTrue);
      },
    );

    test('filterTalhoes returns empty when property has no talhoes', () {
      final unknownProperty = Property(
        id: 'prop-unknown',
        name: 'Unknown',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        owner: 'N/A',
        address: 'N/A',
        latitude: 0.0,
        longitude: 0.0,
      );

      final filtered = talhoes
          .where((t) => t.propertyId == unknownProperty.id)
          .toList();

      expect(filtered, isEmpty);
    });

    test('filterEstadios returns all estadios when no crop type selected', () {
      const selectedCropType = null;
      final filtered = selectedCropType == null
          ? estadios
          : estadios.where((e) => e.cropTypeId == selectedCropType.id).toList();
      expect(filtered.length, 3);
    });

    test(
      'filterEstadios returns only estadios matching selected crop type',
      () {
        final selectedCropType = cropTypes[0]; // Soja (crop-1)

        final filtered = estadios
            .where((e) => e.cropTypeId == selectedCropType.id)
            .toList();

        expect(filtered.length, 2);
        expect(filtered[0].id, 'estadio-1'); // VEG
        expect(filtered[1].id, 'estadio-2'); // FLOR
        expect(filtered.every((e) => e.cropTypeId == 'crop-1'), isTrue);
      },
    );

    test('filterEstadios switches when crop type changes', () {
      // Select Soja -> should show Soja estadios
      var selectedCropType = cropTypes[0]; // Soja
      var filtered = estadios
          .where((e) => e.cropTypeId == selectedCropType.id)
          .toList();
      expect(filtered.length, 2);

      // Switch to Milho -> should show Milho estadios
      selectedCropType = cropTypes[1]; // Milho
      filtered = estadios
          .where((e) => e.cropTypeId == selectedCropType.id)
          .toList();
      expect(filtered.length, 1);
      expect(filtered[0].id, 'estadio-3'); // GRÃ
    });

    test('filterEstadios returns empty when crop type has no estadios', () {
      final unknownCropType = CropType(
        id: 'crop-unknown',
        name: 'Algodão',
        userId: 'user-1',
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
      );

      final filtered = estadios
          .where((e) => e.cropTypeId == unknownCropType.id)
          .toList();

      expect(filtered, isEmpty);
    });
  });

  group('Catalog model parsing', () {
    test('Property.fromJson handles all fields', () {
      final json = {
        'id': 'prop-uuid',
        'name': 'Fazenda Teste',
        'userId': 'user-uuid',
        'owner': 'Owner Name',
        'address': 'Rua Teste, 123',
        'latitude': -22.9,
        'longitude': -43.1,
        'createdAt': '2026-01-01T00:00:00Z',
        'updatedAt': '2026-06-01T00:00:00Z',
      };

      final property = Property.fromJson(json);
      expect(property.id, 'prop-uuid');
      expect(property.name, 'Fazenda Teste');
      expect(property.owner, 'Owner Name');
      expect(property.address, 'Rua Teste, 123');
      expect(property.latitude, -22.9);
      expect(property.longitude, -43.1);
    });

    test('Talhao.fromJson links to property', () {
      final json = {
        'id': 'talhao-uuid',
        'name': 'Talhão 1',
        'userId': 'user-uuid',
        'propertyId': 'prop-uuid',
        'createdAt': '2026-01-01T00:00:00Z',
        'updatedAt': '2026-06-01T00:00:00Z',
      };

      final talhao = Talhao.fromJson(json);
      expect(talhao.propertyId, 'prop-uuid');
    });

    test('Estadio.fromJson links to crop type', () {
      final json = {
        'id': 'estadio-uuid',
        'name': 'VEG',
        'userId': 'user-uuid',
        'cropTypeId': 'crop-uuid',
        'createdAt': '2026-01-01T00:00:00Z',
        'updatedAt': '2026-06-01T00:00:00Z',
      };

      final estadio = Estadio.fromJson(json);
      expect(estadio.cropTypeId, 'crop-uuid');
      expect(estadio.name, 'VEG');
    });
  });

  group('UploadDetail model parsing (list response)', () {
    test('fromJson parses all list fields', () {
      final json = {
        'id': 'upload-uuid',
        'status': 'ready',
        'errorMessage': null,
        'propertyId': 'prop-uuid',
        'talhaoId': 'talhao-uuid',
        'cropTypeId': 'crop-uuid',
        'estadioId': 'estadio-uuid',
        'source': 'drone',
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T10:00:00Z',
        'updatedAt': '2026-07-01T08:00:00Z',
        'files': [
          {
            'id': 'file-1',
            'imageId': 'image-1',
            'latitude': -15.5,
            'longitude': -47.5,
            'variant': 'original',
            'objectKey': 'uploads/u/0/original.jpeg',
            'contentType': 'image/jpeg',
            'sizeBytes': 1024000,
          },
        ],
      };

      final detail = UploadDetail.fromJson(json);
      expect(detail.id, 'upload-uuid');
      expect(detail.status, 'ready');
      expect(detail.estadioId, 'estadio-uuid');
      expect(detail.source, 'drone');
      expect(detail.files.first.latitude, -15.5);
      expect(detail.files.first.longitude, -47.5);
      expect(detail.files.length, 1);
      expect(detail.files.first.variant, 'original');
    });

    test('fromJson handles null estadioId', () {
      final json = {
        'id': 'upload-uuid',
        'status': 'ready',
        'errorMessage': null,
        'propertyId': 'p',
        'talhaoId': 't',
        'cropTypeId': 'c',
        'estadioId': null,
        'source': 'phone',
        'latitude': 0.0,
        'longitude': 0.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T10:00:00Z',
        'updatedAt': '2026-07-01T08:00:00Z',
        'files': [],
      };

      final detail = UploadDetail.fromJson(json);
      expect(detail.estadioId, isNull);
    });

    test('fromJson handles empty files list', () {
      final json = {
        'id': 'upload-uuid',
        'status': 'finalizing',
        'propertyId': 'p',
        'talhaoId': 't',
        'cropTypeId': 'c',
        'source': 'phone',
        'latitude': 0.0,
        'longitude': 0.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T10:00:00Z',
        'updatedAt': '2026-07-01T08:00:00Z',
        'files': [],
      };

      final detail = UploadDetail.fromJson(json);
      expect(detail.files, isEmpty);
      expect(detail.status, 'finalizing');
    });

    test('fromJson handles null files list', () {
      final json = {
        'id': 'upload-uuid',
        'status': 'ready',
        'propertyId': 'p',
        'talhaoId': 't',
        'cropTypeId': 'c',
        'source': 'phone',
        'latitude': 0.0,
        'longitude': 0.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T10:00:00Z',
        'updatedAt': '2026-07-01T08:00:00Z',
      };

      final detail = UploadDetail.fromJson(json);
      expect(detail.files, isEmpty);
    });
  });
}
