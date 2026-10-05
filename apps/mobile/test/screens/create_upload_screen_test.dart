import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/catalog.dart';
import 'package:agrolens/models/pending_upload.dart';
import 'package:agrolens/services/local_image_store.dart';
import 'package:agrolens/screens/create_upload_screen.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/location_service.dart';
import 'package:agrolens/services/token_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  bool failLoad = false;
  Completer<List<Property>>? propertiesLoad;
  List<Property> properties = [];
  List<Talhao> talhoes = [];
  List<CropType> cropTypes = [];
  List<Estadio> estadios = [];

  @override
  Future<List<Property>> getProperties({bool forceRefresh = false}) async {
    if (failLoad) throw StateError('Offline catalogs unavailable');
    if (propertiesLoad != null) return propertiesLoad!.future;
    return properties;
  }

  @override
  Future<List<Talhao>> getTalhoes({bool forceRefresh = false}) async => talhoes;
  @override
  Future<List<CropType>> getCropTypes({bool forceRefresh = false}) async =>
      cropTypes;
  @override
  Future<List<Estadio>> getEstadios({bool forceRefresh = false}) async =>
      estadios;
}

class _DraftDatabaseHelper extends DatabaseHelper {
  _DraftDatabaseHelper({
    required super.appDatabase,
    required super.authService,
  });
  Future<void> Function()? beforeSave;

  @override
  Future<int> insertPendingUpload(PendingUpload upload) async {
    await beforeSave?.call();
    return super.insertPendingUpload(upload);
  }
}

class _DraftStore extends IoLocalImageStore {
  _DraftStore(Directory directory) : super(directory: () async => directory);
  bool failSave = false;
  Future<void> Function()? beforeSave;

  @override
  Future<String> saveImage({
    required XFile file,
    required String fileName,
  }) async {
    await beforeSave?.call();
    if (failSave) throw StateError('Storage full');
    return super.saveImage(file: file, fileName: fileName);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory imagesDir;
  late _ImagePicker picker;
  late _LocationService location;
  late FakeAuthService auth;
  late _DraftDatabaseHelper database;
  late _CatalogRepository catalogs;
  late _DraftStore store;

  setUp(() {
    imagesDir = Directory.systemTemp.createTempSync('agrolens-create-upload-');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          (_) async => imagesDir.path,
        );
    store = _DraftStore(Directory('${imagesDir.path}/saved')..createSync());
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
    database = _DraftDatabaseHelper(appDatabase: appDb, authService: auth);
    catalogs = _CatalogRepository(
      appDatabase: appDb,
      apiClient: api,
      authService: auth,
    );
  });

  tearDown(() async {
    await database.close();
    auth.dispose();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          null,
        );
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

  void seedCatalogs() {
    final common = {
      'userId': auth.currentUser!.id,
      'createdAt': '2026-01-01T00:00:00Z',
      'updatedAt': '2026-01-01T00:00:00Z',
    };
    catalogs.properties = [
      for (final id in ['property-1', 'property-2'])
        Property.fromJson({
          ...common,
          'id': id,
          'name': id,
          'owner': 'owner',
          'address': 'address',
          'latitude': 0,
          'longitude': 0,
        }),
    ];
    catalogs.talhoes = [
      for (final id in ['1', '2'])
        Talhao.fromJson({
          ...common,
          'id': 'talhao-$id',
          'name': 'talhao-$id',
          'propertyId': 'property-$id',
        }),
    ];
    catalogs.cropTypes = [
      CropType.fromJson({...common, 'id': 'crop', 'name': 'crop'}),
    ];
    catalogs.estadios = [
      Estadio.fromJson({
        ...common,
        'id': 'estadio',
        'name': 'estadio',
        'cropTypeId': 'crop',
      }),
    ];
  }

  Future<void> showScreen(WidgetTester tester) async {
    await tester.runAsync(
      () => database.database.customSelect('SELECT 1').get(),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: CreateUploadScreen(
          authService: auth,
          databaseHelper: database,
          catalogRepository: catalogs,
          imagePicker: picker,
          locationService: location,
          imageStore: store,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> showPushedScreen(
    WidgetTester tester, {
    PendingUpload? draft,
    bool waitForCatalogs = true,
  }) async {
    await tester.runAsync(
      () => database.database.customSelect('SELECT 1').get(),
    );
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
                    imageStore: store,
                    draft: draft,
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
    if (waitForCatalogs) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }
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

  Future<void> flushDraft(WidgetTester tester) async {
    for (var i = 0; i < 20; i++) {
      await tester.pump();
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await tester.pump();
    }
  }

  Future<void> tap(
    WidgetTester tester,
    Finder finder, {
    bool towardTop = false,
  }) async {
    await reveal(tester, finder, towardTop: towardTop);
    await tester.tap(finder);
    await flushDraft(tester);
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
    await flushDraft(tester);
    await tester.pumpAndSettle();
    expect(find.text('Abrir novo upload'), findsOneWidget);
    expect(find.text('Novo upload'), findsNothing);
    expect(await tester.runAsync(database.getDrafts), isEmpty);
    expect(await tester.runAsync(store.listPaths), isEmpty);
  });

  testWidgets('keeping a draft on exit preserves its originals', (
    tester,
  ) async {
    picker.galleryPhotos.add([image('kept.png')]);
    await showPushedScreen(tester);
    await tap(tester, find.byType(SwitchListTile), towardTop: true);
    await tap(tester, find.text('Galeria'));
    await tester.tap(find.byTooltip('Voltar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manter rascunho e sair'));
    await flushDraft(tester);
    await tester.pumpAndSettle();
    expect(find.text('Abrir novo upload'), findsOneWidget);
    final draft = (await tester.runAsync(database.getDrafts))!.single;
    expect(
      await tester.runAsync(() => store.exists(draft.paths.single)),
      isTrue,
    );
    expect(await tester.runAsync(database.getPendingAndFailedUploads), isEmpty);
  });

  testWidgets('metadata is autosaved even before selecting photos', (
    tester,
  ) async {
    catalogs.failLoad = true;
    await showScreen(tester);
    await tester.enterText(
      find.widgetWithText(TextFormField, 'ID da propriedade'),
      'property',
    );
    await flushDraft(tester);
    final draft = (await tester.runAsync(database.getDrafts))!.single;
    expect(draft.propertyId, 'property');
    expect(draft.images, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final systemBack in [false, true]) {
    testWidgets(
      'metadata-only draft handles ${systemBack ? 'system' : 'toolbar'} back',
      (tester) async {
        catalogs.failLoad = true;
        await showPushedScreen(tester);
        await tester.enterText(
          find.widgetWithText(TextFormField, 'ID da propriedade'),
          'property',
        );
        await flushDraft(tester);
        if (systemBack) {
          await tester.binding.handlePopRoute();
        } else {
          await tester.tap(find.byTooltip('Voltar'));
        }
        await tester.pumpAndSettle();
        expect(find.text('Descartar upload?'), findsOneWidget);
        await tester.tap(
          find.text(systemBack ? 'Descartar e sair' : 'Manter rascunho e sair'),
        );
        await flushDraft(tester);
        await tester.pumpAndSettle();
        expect(find.text('Abrir novo upload'), findsOneWidget);
        final drafts = (await tester.runAsync(database.getDrafts))!;
        if (systemBack) {
          expect(drafts, isEmpty);
        } else {
          expect(drafts.single.propertyId, 'property');
          expect(drafts.single.images, isEmpty);
        }
      },
    );
  }

  testWidgets('incomplete restored metadata keeps catalog dropdowns usable', (
    tester,
  ) async {
    seedCatalogs();
    await showPushedScreen(tester);
    tester
        .widget<DropdownButtonFormField<Property?>>(
          find.byType(DropdownButtonFormField<Property?>),
        )
        .onChanged!(catalogs.properties.last);
    await flushDraft(tester);
    final draft = (await tester.runAsync(database.getDrafts))!.single;
    expect(draft.propertyId, 'property-2');
    expect(draft.talhaoId, '');
    await tester.tap(find.byTooltip('Voltar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manter rascunho e sair'));
    await flushDraft(tester);
    await tester.pumpAndSettle();

    await showPushedScreen(tester, draft: draft);
    expect(find.text('ID da propriedade'), findsNothing);
    final talhao = find.byType(DropdownButtonFormField<Talhao?>);
    expect(talhao, findsOneWidget);
    expect(
      tester.widget<DropdownButtonFormField<Talhao?>>(talhao).initialValue,
      isNull,
    );
    expect(find.byType(DropdownButtonFormField<Property?>), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<CropType?>), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<Estadio?>), findsOneWidget);
    tester.widget<DropdownButtonFormField<Talhao?>>(talhao).onChanged!(
      catalogs.talhoes.last,
    );
    await flushDraft(tester);
    expect(
      (await tester.runAsync(database.getDrafts))!.single.talhaoId,
      'talhao-2',
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('unresolved non-empty catalog IDs retain manual fallback', (
    tester,
  ) async {
    seedCatalogs();
    final draft = PendingUpload(
      id: 'unresolved',
      ownerId: auth.currentUser!.id,
      createdAt: DateTime.utc(2026),
      status: PendingUploadStatus.draft,
      propertyId: 'missing-property',
      talhaoId: 'missing-talhao',
      cropTypeId: 'missing-crop',
      estadioId: 'missing-estadio',
    );
    await tester.runAsync(() => database.insertPendingUpload(draft));
    await showPushedScreen(tester, draft: draft);
    expect(
      find.widgetWithText(TextFormField, 'missing-property'),
      findsOneWidget,
    );
    await flushDraft(tester);
    final saved = (await tester.runAsync(database.getDrafts))!.single;
    expect(saved.propertyId, draft.propertyId);
    expect(saved.talhaoId, draft.talhaoId);
    expect(saved.cropTypeId, draft.cropTypeId);
    expect(saved.estadioId, draft.estadioId);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('drafts with no selected catalog IDs retain all dropdowns', (
    tester,
  ) async {
    seedCatalogs();
    final draft = PendingUpload(
      id: 'empty-metadata',
      ownerId: auth.currentUser!.id,
      createdAt: DateTime.utc(2026),
      status: PendingUploadStatus.draft,
    );
    await tester.runAsync(() => database.insertPendingUpload(draft));
    await showPushedScreen(tester, draft: draft);
    expect(find.text('ID da propriedade'), findsNothing);
    expect(
      tester
          .widget<DropdownButtonFormField<Property?>>(
            find.byType(DropdownButtonFormField<Property?>),
          )
          .initialValue,
      isNull,
    );
    expect(
      tester
          .widget<DropdownButtonFormField<Talhao?>>(
            find.byType(DropdownButtonFormField<Talhao?>),
          )
          .initialValue,
      isNull,
    );
    expect(
      tester
          .widget<DropdownButtonFormField<CropType?>>(
            find.byType(DropdownButtonFormField<CropType?>),
          )
          .initialValue,
      isNull,
    );
    expect(
      tester
          .widget<DropdownButtonFormField<Estadio?>>(
            find.byType(DropdownButtonFormField<Estadio?>),
          )
          .initialValue,
      isNull,
    );
    await flushDraft(tester);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('saved indicator waits for a delayed photo commit', (
    tester,
  ) async {
    picker.galleryPhotos.add([image('delayed.png')]);
    await showScreen(tester);
    await tap(tester, find.byType(SwitchListTile), towardTop: true);
    final started = Completer<void>();
    final release = Completer<void>();
    store.beforeSave = () async {
      started.complete();
      await release.future;
    };
    try {
      await reveal(tester, find.text('Galeria'));
      await tester.tap(find.text('Galeria'));
      await flushDraft(tester);
      expect(started.isCompleted, isTrue);
      await reveal(
        tester,
        find.textContaining('Salvando rascunho'),
        towardTop: true,
      );
      expect(find.textContaining('Salvando rascunho'), findsOneWidget);
      expect(
        find.textContaining('Rascunho salvo neste dispositivo'),
        findsNothing,
      );
      expect(await tester.runAsync(database.getDrafts), isEmpty);
      release.complete();
      await flushDraft(tester);
      expect(find.textContaining('Salvando rascunho'), findsNothing);
      expect(
        find.textContaining('Rascunho salvo neste dispositivo'),
        findsOneWidget,
      );
      expect(await tester.runAsync(database.getDrafts), hasLength(1));
    } finally {
      if (!release.isCompleted) release.complete();
      store.beforeSave = null;
      await flushDraft(tester);
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });

  for (final failSave in [false, true]) {
    testWidgets(
      'last-photo removal waits on exit and ${failSave ? 'preserves originals on failure' : 'cleans originals after commit'}',
      (tester) async {
        final path = (await tester.runAsync(
          () => store.saveImage(
            file: image('restored.png'),
            fileName: 'restored.png',
          ),
        ))!;
        final draft = PendingUpload(
          id: 'last-photo',
          ownerId: auth.currentUser!.id,
          createdAt: DateTime.utc(2026),
          status: PendingUploadStatus.draft,
          paths: [path],
        );
        await tester.runAsync(() => database.insertPendingUpload(draft));
        await showPushedScreen(tester, draft: draft);
        final remove = find.byWidgetPredicate(
          (widget) =>
              widget is Semantics &&
              widget.properties.label == 'Remover imagem 1',
        );
        await reveal(tester, remove);
        final started = Completer<void>();
        final release = Completer<void>();
        database.beforeSave = () async {
          if (!started.isCompleted) started.complete();
          await release.future;
          if (failSave) throw StateError('Storage unavailable');
        };
        try {
          await tester.tap(remove);
          await tester.pump();
          await tester.binding.handlePopRoute();
          await tester.pumpAndSettle();
          expect(find.text('Descartar upload?'), findsOneWidget);
          await tester.tap(find.text('Manter rascunho e sair'));
          await flushDraft(tester);
          expect(started.isCompleted, isTrue);
          expect(find.text('Novo upload'), findsOneWidget);
          expect((await tester.runAsync(database.getDrafts))!.single.paths, [
            path,
          ]);
          expect(await tester.runAsync(() => store.exists(path)), isTrue);
          release.complete();
          await flushDraft(tester);
          await tester.pumpAndSettle();
          final saved = (await tester.runAsync(database.getDrafts))!.single;
          if (failSave) {
            expect(find.text('Novo upload'), findsOneWidget);
            expect(saved.paths, [path]);
            expect(await tester.runAsync(() => store.exists(path)), isTrue);
            database.beforeSave = null;
            await tester.tap(find.byTooltip('Voltar'));
            await tester.pumpAndSettle();
            await tester.tap(find.text('Descartar e sair'));
            await flushDraft(tester);
            await tester.pumpAndSettle();
            expect(await tester.runAsync(database.getDrafts), isEmpty);
          } else {
            expect(find.text('Abrir novo upload'), findsOneWidget);
            expect(saved.images, isEmpty);
          }
          expect(await tester.runAsync(() => store.exists(path)), isFalse);
        } finally {
          if (!release.isCompleted) release.complete();
          database.beforeSave = null;
          await flushDraft(tester);
          await tester.pumpWidget(const SizedBox.shrink());
        }
      },
    );
  }

  testWidgets(
    'keeping a restored draft before catalogs load preserves all IDs',
    (tester) async {
      final draft = PendingUpload(
        id: 'restored-draft',
        ownerId: auth.currentUser!.id,
        createdAt: DateTime.utc(2026),
        status: PendingUploadStatus.draft,
        propertyId: 'property-id',
        talhaoId: 'talhao-id',
        cropTypeId: 'crop-type-id',
        estadioId: 'estadio-id',
      );
      await tester.runAsync(() => database.insertPendingUpload(draft));
      final propertiesLoad = Completer<List<Property>>();
      catalogs.propertiesLoad = propertiesLoad;
      try {
        await showPushedScreen(tester, draft: draft, waitForCatalogs: false);
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        await tester.tap(find.byTooltip('Voltar'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.tap(find.text('Manter rascunho e sair'));
        await flushDraft(tester);
        await tester.pumpAndSettle();

        expect(propertiesLoad.isCompleted, isFalse);
        expect(find.text('Abrir novo upload'), findsOneWidget);
        final saved = (await tester.runAsync(database.getDrafts))!.single;
        expect(saved.id, draft.id);
        expect(saved.propertyId, draft.propertyId);
        expect(saved.talhaoId, draft.talhaoId);
        expect(saved.cropTypeId, draft.cropTypeId);
        expect(saved.estadioId, draft.estadioId);
      } finally {
        propertiesLoad.complete([]);
        await tester.pump();
      }
    },
  );

  testWidgets(
    'photos and metadata restore after closure; finalization reuses one batch',
    (tester) async {
      catalogs.failLoad = true;
      picker.cameraPhotos.add(image('draft.png'));
      await showScreen(tester);
      await tap(tester, find.byType(SwitchListTile), towardTop: true);
      await tap(tester, find.text('Câmera'));
      for (final field in [
        ('ID da propriedade', 'property'),
        ('ID do talhão', 'talhao'),
        ('ID da cultura', 'crop'),
      ]) {
        final finder = find.widgetWithText(TextFormField, field.$1);
        await reveal(tester, finder, towardTop: true);
        await tester.enterText(finder, field.$2);
      }
      await flushDraft(tester);
      final drafts = (await tester.runAsync(database.getDrafts))!;
      final draft = drafts.single;
      expect(draft.propertyId, 'property');
      expect(draft.images.single.origin, 'camera');
      expect(
        await tester.runAsync(database.getPendingAndFailedUploads),
        isEmpty,
      );
      expect(
        find.textContaining('Rascunho salvo neste dispositivo'),
        findsOneWidget,
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(
        MaterialApp(
          home: CreateUploadScreen(
            authService: auth,
            databaseHelper: database,
            catalogRepository: catalogs,
            imagePicker: picker,
            imageStore: store,
            locationService: location,
            draft: draft,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextFormField, 'property'), findsOneWidget);
      await reveal(tester, find.text('Imagens selecionadas (1)'));
      expect(find.text('Imagens selecionadas (1)'), findsOneWidget);
      await reveal(tester, find.text('Confirmar e preparar lote'));
      await tester.tap(find.text('Confirmar e preparar lote'));
      await flushDraft(tester);
      await tester.tap(find.text('Salvar sem localização'));
      await flushDraft(tester);
      final queued = (await tester.runAsync(database.getAllUploads))!;
      expect(queued.single.id, draft.id);
      expect(queued.single.status, PendingUploadStatus.pending);
      expect(queued.single.paths, draft.paths);
      expect(queued.single.images.single.imageId, draft.images.single.imageId);
      expect(await tester.runAsync(store.listPaths), hasLength(1));
      expect(await tester.runAsync(database.getDrafts), isEmpty);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('failed autosave never reports saved and can be retried', (
    tester,
  ) async {
    store.failSave = true;
    picker.cameraPhotos.add(image('draft.png'));
    await showScreen(tester);
    await tap(tester, find.byType(SwitchListTile), towardTop: true);
    await tap(tester, find.text('Câmera'));
    expect(
      find.textContaining('Rascunho salvo neste dispositivo'),
      findsNothing,
    );
    expect(await tester.runAsync(database.getDrafts), isEmpty);
    await reveal(tester, find.text('Tentar salvar rascunho'), towardTop: true);
    expect(find.textContaining('Rascunho não salvo'), findsOneWidget);
    store.failSave = false;
    await tap(tester, find.text('Tentar salvar rascunho'), towardTop: true);
    expect(
      find.textContaining('Rascunho salvo neste dispositivo'),
      findsOneWidget,
    );
    expect(await tester.runAsync(database.getDrafts), hasLength(1));
    await tester.pumpWidget(const SizedBox.shrink());
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

  testWidgets('removing the last image still offers keep or discard', (
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
    expect(find.text('Descartar upload?'), findsOneWidget);
    await tester.tap(find.text('Descartar e sair'));
    await flushDraft(tester);
    await tester.pumpAndSettle();
    expect(find.text('Abrir novo upload'), findsOneWidget);
    expect(await tester.runAsync(database.getDrafts), isEmpty);
    expect(await tester.runAsync(store.listPaths), isEmpty);
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
    await tester.pumpWidget(const SizedBox.shrink());
    final destroyed = BuiltInMapCachingProvider.getOrCreateInstance().destroy();
    await flushDraft(tester);
    await destroyed;
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
