import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/auth_service.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/sync_service.dart';
import 'package:agrolens/services/token_storage.dart';
import 'package:agrolens/screens/remote_uploads_screen.dart';
import '../helpers/test_doubles.dart';

void main() {
  late MockHttpClient mockHttp;
  late ApiClient apiClient;
  late AuthService authService;
  late CatalogRepository catalogRepository;
  late DatabaseHelper databaseHelper;

  setUp(() async {
    mockHttp = MockHttpClient();
    apiClient = ApiClient(
      httpClient: mockHttp,
      env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
    );
    final tokenStorage = TokenStorage(storage: FakeFlutterSecureStorage());
    authService = AuthService(apiClient: apiClient, tokenStorage: tokenStorage);
    await tokenStorage.saveTokens(
      accessToken: testAccessToken('user-1'),
      refreshToken: 'refresh-456',
    );
    final now = DateTime.now().toIso8601String();
    mockHttp.queueResponse('GET', '/api/auth/me', 200, {
      'user': {
        'id': 'user-1',
        'email': 'test@example.com',
        'fullName': 'Test User',
        'phone': null,
        'role': 'user',
        'disabledAt': null,
        'createdAt': now,
        'updatedAt': now,
      },
    });
    await authService.tryRestoreSession();
    final appDb = createTestAppDatabase();
    addTearDown(appDb.close);
    catalogRepository = CatalogRepository(
      appDatabase: appDb,
      apiClient: apiClient,
      authService: authService,
    );
    databaseHelper = DatabaseHelper(
      appDatabase: appDb,
      authService: authService,
    );
  });

  Widget buildScreen() {
    final syncService = SyncService(
      apiClient: apiClient,
      authService: authService,
      databaseHelper: databaseHelper,
      catalogRepository: catalogRepository,
    );
    return MaterialApp(
      home: RemoteUploadsScreen(
        authService: authService,
        syncService: syncService,
        catalogRepository: catalogRepository,
      ),
    );
  }

  Map<String, dynamic> uploadJson(int i, {bool withPreview = true}) {
    final now = DateTime.now().toIso8601String();
    return {
      'id': 'upload-$i-abcdef1234567890',
      'status': 'ready',
      'fileCount': 4,
      'errorMessage': null,
      'propertyId': 'prop-$i',
      'talhaoId': 'talhao-$i',
      'cropTypeId': 'crop-$i',
      'estadioId': null,
      'source': 'phone',
      'latitude': -22.123456,
      'longitude': -47.654321,
      'activityDate': now,
      'createdAt': now,
      'updatedAt': now,
      'previewFileId': withPreview ? 'file-preview-$i' : null,
      'previewImageIndex': withPreview ? 0 : null,
      'previewCount': withPreview ? 4 : 0,
      'files': <dynamic>[],
    };
  }

  testWidgets('error state renders retry button without overflow', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    // No queued response for GET /uploads -> ApiException(404).
    await tester.pumpWidget(buildScreen());
    await tester.pumpAndSettle();

    expect(find.text('Tentar novamente'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('two-column cards and load-more render without overflow', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    mockHttp.queueResponse('GET', '/api/uploads', 200, {
      'uploads': [for (var i = 0; i < 20; i++) uploadJson(i)],
    });

    await tester.pumpWidget(buildScreen());
    await tester.pumpAndSettle();

    expect(find.byType(Card), findsWidgets);
    expect(find.textContaining('upload-'), findsNothing);
    expect(find.textContaining('Status:'), findsNothing);
    expect(find.textContaining('Atividade:'), findsNothing);
    expect(find.textContaining('Pré-visualizações:'), findsNothing);
    expect(find.byTooltip('Atualizar status'), findsNothing);
    expect(find.byTooltip('Atualizar lista'), findsOneWidget);
    expect(find.text('4 imagens'), findsWidgets);
    expect(find.text('Celular'), findsNothing);
    final preview = find.byType(AspectRatio).first;
    expect(tester.getSize(preview).width, lessThan(160));
    expect(tester.getSize(preview).height, lessThan(100));
    final firstCard = find.byType(Card).at(0);
    final secondCard = find.byType(Card).at(1);
    expect(tester.getTopLeft(firstCard).dy, tester.getTopLeft(secondCard).dy);
    expect(
      tester.getTopLeft(secondCard).dx,
      greaterThan(tester.getTopRight(firstCard).dx),
    );
    await tester.scrollUntilVisible(
      find.text('Carregar mais'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Carregar mais'), findsOneWidget);
    mockHttp.queueResponse('GET', '/api/uploads', 200, {
      'uploads': [uploadJson(20)],
    });
    await tester.tap(find.text('Carregar mais'));
    await tester.pumpAndSettle();
    expect(find.text('Carregar mais'), findsNothing);
    expect(
      mockHttp.requests
          .lastWhere((r) => r.url.path == '/api/uploads')
          .url
          .queryParameters['offset'],
      '20',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('odd upload stays half-width on its own row', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    mockHttp.queueResponse('GET', '/api/uploads', 200, {
      'uploads': [
        for (var i = 0; i < 3; i++) uploadJson(i, withPreview: false),
      ],
    });
    await tester.pumpWidget(buildScreen());
    await tester.pumpAndSettle();
    final firstCard = find.byType(Card).at(0);
    final lastCard = find.byType(Card).at(2);
    expect(tester.getSize(firstCard).width, tester.getSize(lastCard).width);
    expect(tester.getTopLeft(firstCard).dx, tester.getTopLeft(lastCard).dx);
    expect(
      tester.getTopLeft(lastCard).dy,
      greaterThan(tester.getBottomLeft(firstCard).dy),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('list item with long error message wraps without overflow', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final withError = uploadJson(1, withPreview: false);
    withError['errorMessage'] =
        'Falha no processamento: o arquivo excedeu o tamanho máximo permitido '
        'pelo servidor e precisará ser reenviado manualmente.';
    mockHttp.queueResponse('GET', '/api/uploads', 200, {
      'uploads': [withError],
    });

    await tester.pumpWidget(buildScreen());
    await tester.pumpAndSettle();

    expect(find.byType(Card), findsOneWidget);
    expect(find.textContaining('Falha no processamento:'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  Map<String, dynamic> fileJson(
    int i, {
    String variant = 'original',
    double? latitude = -22.123456,
    double? longitude = -47.654321,
  }) => {
    'id': '$variant-$i',
    'imageId': 'image-$i',
    'variant': variant,
    'latitude': latitude,
    'longitude': longitude,
    'contentType': 'image/jpeg',
    'objectKey': 'uploads/technical-storage-key-$i',
    'sizeBytes': 1024,
  };

  void queueImageUrl(String variant, int i) {
    final fileId = '$variant-$i';
    final endpoint = variant == 'preview' ? 'preview-url' : 'download-url';
    mockHttp.queueResponse(
      'GET',
      '/api/uploads/upload-1-abcdef1234567890/files/$fileId/$endpoint',
      200,
      {
        'downloadUrl': 'https://test.images/$fileId.jpg',
        'expiresAt': '2099-01-01T00:00:00Z',
        'fileId': fileId,
        'uploadId': 'upload-1-abcdef1234567890',
      },
    );
  }

  Future<void> openDetail(
    WidgetTester tester,
    List<Map<String, dynamic>> files,
  ) async {
    final upload = uploadJson(1, withPreview: false);
    upload['files'] = files;
    upload['fileCount'] = files.where((f) => f['variant'] == 'original').length;
    mockHttp.queueResponse('GET', '/api/uploads', 200, {
      'uploads': [upload],
    });
    mockHttp.queueResponse('GET', '/api/uploads/${upload['id']}', 200, upload);
    await tester.pumpWidget(buildScreen());
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Card).first);
    await tester.pumpAndSettle();
  }

  testWidgets('compact carousel shows all images without visible headings', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    queueImageUrl('preview', 1);
    queueImageUrl('original', 2);
    queueImageUrl('original', 3);
    await openDetail(tester, [
      fileJson(1),
      fileJson(1, variant: 'preview'),
      fileJson(2, latitude: null, longitude: null),
      fileJson(3),
    ]);

    expect(find.byType(PageView), findsOneWidget);
    expect(find.textContaining('Imagens ('), findsNothing);
    expect(find.text('Imagem 1'), findsNothing);
    expect(find.text('Imagem 2'), findsNothing);
    expect(find.text('Imagem 3'), findsNothing);
    expect(find.text('Ver no mapa'), findsOneWidget);
    expect(find.text('Sem localização'), findsNothing);
    expect(
      tester
          .widget<IconButton>(
            find.widgetWithIcon(IconButton, Icons.chevron_left),
          )
          .onPressed,
      isNull,
    );
    final firstImage = find.byType(Image).first;
    expect(tester.getSize(firstImage).height, greaterThan(200));
    expect(tester.getSize(firstImage).height, lessThanOrEqualTo(280));
    expect(tester.widget<Image>(firstImage).fit, BoxFit.contain);

    await tester.tap(firstImage);
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsOneWidget);
    await tester.tap(find.byTooltip('Fechar imagem'));
    await tester.pumpAndSettle();

    await tester.drag(find.byType(PageView), const Offset(-260, 0));
    await tester.pumpAndSettle();
    expect(find.text('Sem localização'), findsOneWidget);
    expect(find.text('Ver no mapa'), findsNothing);
    await tester.tap(find.byTooltip('Próxima imagem'));
    await tester.pumpAndSettle();
    expect(find.text('Ver no mapa'), findsOneWidget);
    expect(
      tester
          .widget<IconButton>(
            find.widgetWithIcon(IconButton, Icons.chevron_right),
          )
          .onPressed,
      isNull,
    );
    expect(
      mockHttp.requests.where(
        (r) => r.url.path.endsWith('/original-3/download-url'),
      ),
      hasLength(1),
    );
    await tester.tap(find.byTooltip('Imagem anterior'));
    await tester.pumpAndSettle();
    expect(find.text('Sem localização'), findsOneWidget);
    expect(
      mockHttp.requests.where(
        (r) => r.url.path.endsWith('/original-2/download-url'),
      ),
      hasLength(1),
    );
    expect(
      mockHttp.requests.where(
        (r) => r.url.path.endsWith('/preview-1/preview-url'),
      ),
      hasLength(1),
    );
    expect(find.textContaining('Tipo:'), findsNothing);
    expect(find.textContaining('Chave:'), findsNothing);
    expect(find.textContaining('Tamanho:'), findsNothing);
    expect(find.textContaining('-22.123456'), findsNothing);
    expect(find.text('ID do upload'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('map button opens coordinates and reports launch failure', (
    tester,
  ) async {
    const channel = MethodChannel('plugins.flutter.io/url_launcher');
    final launchedUrls = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      launchedUrls.add((call.arguments as Map)['url'] as String);
      return false;
    });
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        null,
      ),
    );
    queueImageUrl('original', 1);
    await openDetail(tester, [fileJson(1)]);
    await tester.ensureVisible(find.text('Ver no mapa'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ver no mapa'));
    await tester.pumpAndSettle();

    expect(
      Uri.parse(launchedUrls.last).queryParameters['query'],
      '-22.123456,-47.654321',
    );
    expect(
      find.text('Não foi possível abrir o mapa. Tente novamente.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('partial coordinates do not show a map button', (tester) async {
    queueImageUrl('original', 1);
    await openDetail(tester, [fileJson(1, longitude: null)]);
    expect(find.text('Ver no mapa'), findsNothing);
    expect(find.text('Sem localização'), findsOneWidget);
    expect(find.byTooltip('Imagem anterior'), findsNothing);
    expect(find.byTooltip('Próxima imagem'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'carousel actions follow the selected image and reset on refresh',
    (tester) async {
      const channel = MethodChannel('plugins.flutter.io/url_launcher');
      final launchedUrls = <Uri>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
        call,
      ) async {
        launchedUrls.add(Uri.parse((call.arguments as Map)['url'] as String));
        return true;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          channel,
          null,
        ),
      );
      queueImageUrl('original', 1);
      queueImageUrl('original', 2);
      await openDetail(tester, [
        fileJson(1),
        fileJson(2, latitude: 10, longitude: 20),
      ]);
      await tester.tap(find.byTooltip('Próxima imagem'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ver no mapa'));
      await tester.pumpAndSettle();
      expect(
        launchedUrls.last.queryParameters['q'] ??
            launchedUrls.last.queryParameters['query'],
        '10.0,20.0',
      );

      queueImageUrl('original', 2);
      await tester.tap(find.text('Abrir original'));
      await tester.pumpAndSettle();
      expect(launchedUrls.last.path, '/original-2.jpg');

      final refreshed = uploadJson(1, withPreview: false);
      refreshed['files'] = [fileJson(1)];
      refreshed['fileCount'] = 1;
      mockHttp.queueResponse(
        'GET',
        '/api/uploads/${refreshed['id']}',
        200,
        refreshed,
      );
      queueImageUrl('original', 1);
      await tester.tap(find.byTooltip('Atualizar'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<PageView>(find.byType(PageView)).controller!.page,
        0,
      );
      expect(find.byTooltip('Próxima imagem'), findsNothing);
      await tester.tap(find.text('Ver no mapa'));
      await tester.pumpAndSettle();
      expect(
        launchedUrls.last.queryParameters['q'] ??
            launchedUrls.last.queryParameters['query'],
        '-22.123456,-47.654321',
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('empty upload does not build a carousel', (tester) async {
    await openDetail(tester, []);
    expect(find.byType(PageView), findsNothing);
    expect(
      find.text('Nenhuma imagem disponível neste upload.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}
