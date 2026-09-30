import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/catalog.dart';
import 'package:agrolens/screens/create_upload_screen.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/location_service.dart';
import 'package:agrolens/services/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';

import '../helpers/test_doubles.dart';

class _ImagePicker extends ImagePicker {
  final cameraPhotos = Queue<XFile?>();
  final galleryPhotos = Queue<List<XFile>>();

  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async => cameraPhotos.removeFirst();

  @override
  Future<List<XFile>> pickMultiImage({
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    int? limit,
    bool requestFullMetadata = true,
  }) async => galleryPhotos.removeFirst();
}

class _LocationService extends LocationService {
  final positions = Queue<Future<LatLng> Function()>();
  int calls = 0;

  @override
  Future<LatLng> getCurrentPosition({
    LocationAccuracy accuracy = LocationAccuracy.best,
    int distanceFilter = 10,
    Duration timeLimit = const Duration(seconds: 15),
  }) {
    calls++;
    return positions.removeFirst()();
  }
}

class _CatalogRepository extends CatalogRepository {
  _CatalogRepository({
    required super.appDatabase,
    required super.apiClient,
    required super.authService,
  });

  @override
  Future<List<Property>> getProperties({bool forceRefresh = false}) async => [];
  @override
  Future<List<Talhao>> getTalhoes({bool forceRefresh = false}) async => [];
  @override
  Future<List<CropType>> getCropTypes({bool forceRefresh = false}) async => [];
  @override
  Future<List<Estadio>> getEstadios({bool forceRefresh = false}) async => [];
}

void main() {
  late Directory imagesDir;
  late _ImagePicker picker;
  late _LocationService location;
  late FakeAuthService auth;
  late DatabaseHelper database;
  late _CatalogRepository catalogs;

  setUp(() {
    imagesDir = Directory.systemTemp.createTempSync('agrolens-create-upload-');
    picker = _ImagePicker();
    location = _LocationService();
    final api = ApiClient(
      httpClient: MockHttpClient(),
      env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
    );
    auth = FakeAuthService(
      apiClient: api,
      tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
    );
    final appDb = createTestAppDatabase();
    database = DatabaseHelper(appDatabase: appDb, authService: auth);
    catalogs = _CatalogRepository(
      appDatabase: appDb,
      apiClient: api,
      authService: auth,
    );
  });

  tearDown(() {
    imagesDir.deleteSync(recursive: true);
  });

  XFile image(String name) {
    final file = File('${imagesDir.path}/$name');
    file.writeAsBytesSync(
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==',
      ),
    );
    return XFile(file.path);
  }

  Future<void> showScreen(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CreateUploadScreen(
          authService: auth,
          databaseHelper: database,
          catalogRepository: catalogs,
          imagePicker: picker,
          locationService: location,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> showPushedScreen(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => CreateUploadScreen(
                    authService: auth,
                    databaseHelper: database,
                    catalogRepository: catalogs,
                    imagePicker: picker,
                    locationService: location,
                  ),
                ),
              ),
              child: const Text('Abrir novo upload'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Abrir novo upload'));
    await tester.pumpAndSettle();
  }

  Future<void> reveal(
    WidgetTester tester,
    Finder finder, {
    bool towardTop = false,
  }) async {
    await tester.scrollUntilVisible(
      finder,
      towardTop ? -250 : 250,
      scrollable: find.byType(Scrollable).first,
    );
    await Scrollable.ensureVisible(tester.element(finder), alignment: 0.5);
    await tester.pumpAndSettle();
  }

  Future<void> tap(
    WidgetTester tester,
    Finder finder, {
    bool towardTop = false,
  }) async {
    await reveal(tester, finder, towardTop: towardTop);
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Finder imageLocation(int number, String status) => find.descendant(
    of: find.byWidgetPredicate(
      (widget) =>
          widget is Semantics &&
          widget.properties.label == 'Localização da imagem $number',
    ),
    matching: find.text(status),
  );

  testWidgets('back button and system back require confirmation with images', (
    tester,
  ) async {
    picker.galleryPhotos.add([image('gallery.png')]);
    await showPushedScreen(tester);
    await tap(tester, find.byType(SwitchListTile), towardTop: true);
    await tap(tester, find.text('Galeria'));

    await tester.tap(find.byTooltip('Voltar'));
    await tester.pumpAndSettle();
    expect(find.text('Descartar upload?'), findsOneWidget);
    expect(find.text('Abrir novo upload'), findsNothing);
    await tester.tap(find.text('Continuar edição'));
    await tester.pumpAndSettle();
    expect(imageLocation(1, 'Sem localização · ajustar'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Descartar upload?'), findsOneWidget);
    await tester.tap(find.text('Descartar e sair'));
    await tester.pumpAndSettle();
    expect(find.text('Abrir novo upload'), findsOneWidget);
    expect(find.text('Novo upload'), findsNothing);
  });

  testWidgets('back leaves without confirmation when no images are selected', (
    tester,
  ) async {
    await showPushedScreen(tester);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Abrir novo upload'), findsOneWidget);
    expect(find.text('Descartar upload?'), findsNothing);
  });

  testWidgets('removing the last image removes the exit warning', (
    tester,
  ) async {
    picker.cameraPhotos.add(image('camera.png'));
    await showPushedScreen(tester);
    await tap(tester, find.byType(SwitchListTile), towardTop: true);
    await tap(tester, find.text('Câmera'));
    final remove = find.byWidgetPredicate(
      (widget) =>
          widget is Semantics && widget.properties.label == 'Remover imagem 1',
    );
    await tap(tester, remove);
    await tester.tap(find.byTooltip('Voltar'));
    await tester.pumpAndSettle();
    expect(find.text('Abrir novo upload'), findsOneWidget);
    expect(find.text('Descartar upload?'), findsNothing);
  });

  testWidgets(
    'camera respects the GPS opt-out and leaves manual location available',
    (tester) async {
      picker.cameraPhotos.add(image('camera.png'));
      await showScreen(tester);

      expect(find.text('Aplicar localização atual'), findsOneWidget);
      expect(find.text('Selecionar no mapa'), findsNothing);
      await tap(tester, find.byType(SwitchListTile), towardTop: true);
      expect(find.text('Selecionar no mapa'), findsOneWidget);
      expect(find.text('Aplicar localização atual'), findsNothing);
      expect(find.text('Aplicar às imagens sem localização'), findsNothing);
      expect(find.text('Latitude'), findsNothing);
      expect(find.text('Longitude'), findsNothing);
      await tap(tester, find.text('Câmera'));

      expect(location.calls, 0);
      expect(imageLocation(1, 'Sem localização · ajustar'), findsOneWidget);
      await tap(tester, find.byType(SwitchListTile), towardTop: true);
      expect(location.calls, 0);
      expect(find.text('Aplicar localização atual'), findsOneWidget);
      expect(find.text('Selecionar no mapa'), findsNothing);
    },
  );

  testWidgets('confirmed map point applies to unlocated images only', (
    tester,
  ) async {
    picker.cameraPhotos.addAll([image('one.png'), image('two.png')]);
    location.positions.add(() async => const LatLng(-20, -41));
    await showScreen(tester);
    await tap(tester, find.text('Câmera'));
    await tap(tester, find.byType(SwitchListTile), towardTop: true);
    await tap(tester, find.text('Câmera'));
    expect(location.calls, 1);

    await tap(tester, find.text('Selecionar no mapa'), towardTop: true);
    expect(find.text('Minha localização'), findsNothing);
    expect(find.text('Nenhum ponto escolhido. Toque no mapa.'), findsOneWidget);
    final confirm = find.widgetWithText(
      ElevatedButton,
      'Usar ponto selecionado',
    );
    expect(tester.widget<ElevatedButton>(confirm).onPressed, isNull);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(imageLocation(1, 'Localizada · ajustar'), findsOneWidget);
    expect(imageLocation(2, 'Sem localização · ajustar'), findsOneWidget);

    await tap(tester, find.text('Selecionar no mapa'), towardTop: true);
    tester.widget<FlutterMap>(find.byType(FlutterMap)).options.onTap!(
      const TapPosition(Offset.zero, Offset.zero),
      const LatLng(-23, -46),
    );
    await tester.pump();
    expect(tester.widget<ElevatedButton>(confirm).onPressed, isNotNull);
    await tester.tap(confirm);
    await tester.pumpAndSettle();

    await reveal(tester, imageLocation(1, 'Localizada · ajustar'));
    expect(imageLocation(2, 'Localizada · ajustar'), findsOneWidget);
    expect(find.text('Aplicar às imagens sem localização'), findsNothing);
    expect(location.calls, 1);

    await tap(tester, imageLocation(1, 'Localizada · ajustar'));
    expect(find.text('Latitude: -20.000000'), findsOneWidget);
    expect(find.text('Longitude: -41.000000'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    await tap(tester, imageLocation(2, 'Localizada · ajustar'));
    expect(find.text('Latitude: -23.000000'), findsOneWidget);
    expect(find.text('Longitude: -46.000000'), findsOneWidget);
  });

  testWidgets('camera waits for the GPS result before warning about location', (
    tester,
  ) async {
    final pending = Completer<LatLng>();
    location.positions.add(() => pending.future);
    picker.cameraPhotos.add(image('camera.png'));
    await showScreen(tester);

    await tap(tester, find.text('Câmera'));
    expect(location.calls, 1);
    expect(imageLocation(1, 'Localizando · ajustar'), findsOneWidget);
    await reveal(tester, find.text('Confirmar e preparar lote'));
    expect(find.textContaining('imagem precisa de localização.'), findsNothing);

    pending.complete(const LatLng(-22, -43));
    await tester.pumpAndSettle();
    await reveal(tester, imageLocation(1, 'Localizada · ajustar'));
    expect(find.textContaining('imagem precisa de localização.'), findsNothing);
  });

  testWidgets('camera shows the missing-location warning after GPS fails', (
    tester,
  ) async {
    final pending = Completer<LatLng>();
    location.positions.add(() => pending.future);
    picker.cameraPhotos.add(image('camera.png'));
    await showScreen(tester);

    await tap(tester, find.text('Câmera'));
    expect(imageLocation(1, 'Localizando · ajustar'), findsOneWidget);
    expect(find.textContaining('imagem precisa de localização.'), findsNothing);

    pending.completeError(const LocationException('GPS indisponível'));
    await tester.pumpAndSettle();
    await reveal(tester, find.textContaining('imagem precisa de localização.'));
    expect(imageLocation(1, 'Sem localização · ajustar'), findsOneWidget);
    expect(find.text('GPS indisponível'), findsOneWidget);
  });

  testWidgets(
    'switching GPS off before a camera fix returns does not apply it',
    (tester) async {
      final pending = Completer<LatLng>();
      location.positions.add(() => pending.future);
      picker.cameraPhotos.add(image('camera.png'));
      await showScreen(tester);

      await tap(tester, find.text('Câmera'));
      expect(location.calls, 1);
      expect(imageLocation(1, 'Localizando · ajustar'), findsOneWidget);
      await tap(tester, find.byType(SwitchListTile), towardTop: true);
      await reveal(
        tester,
        find.textContaining('imagem precisa de localização.'),
      );
      expect(imageLocation(1, 'Sem localização · ajustar'), findsOneWidget);
      pending.complete(const LatLng(-22, -43));
      await tester.pumpAndSettle();

      await reveal(tester, find.text('Sem localização · ajustar'));
      expect(imageLocation(1, 'Sem localização · ajustar'), findsOneWidget);
    },
  );

  testWidgets(
    'a later gallery GPS fix does not fill an earlier unlocated camera photo',
    (tester) async {
      picker.cameraPhotos.add(image('camera.png'));
      picker.galleryPhotos.add([image('gallery.png')]);
      location.positions.add(
        () async => throw const LocationException('GPS unavailable'),
      );
      final galleryPending = Completer<LatLng>();
      location.positions.add(() => galleryPending.future);
      location.positions.add(() async => const LatLng(-22, -43));
      await showScreen(tester);

      await tap(tester, find.text('Câmera'));
      await tap(tester, find.text('Galeria'));
      expect(location.calls, 2);
      expect(imageLocation(1, 'Sem localização · ajustar'), findsOneWidget);
      expect(imageLocation(2, 'Localizando · ajustar'), findsOneWidget);
      await reveal(
        tester,
        find.textContaining('1 imagem precisa de localização.'),
      );

      galleryPending.complete(const LatLng(-20, -41));
      await tester.pumpAndSettle();
      await reveal(tester, imageLocation(1, 'Sem localização · ajustar'));
      expect(imageLocation(2, 'Localizada · ajustar'), findsOneWidget);

      await tap(
        tester,
        find.text('Aplicar localização atual'),
        towardTop: true,
      );
      expect(location.calls, 3);
      await reveal(tester, find.text('Localizada · ajustar').first);
      expect(find.text('Sem localização · ajustar'), findsNothing);
      expect(imageLocation(1, 'Localizada · ajustar'), findsOneWidget);
      expect(imageLocation(2, 'Localizada · ajustar'), findsOneWidget);
    },
  );
}
