import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/models/inference.dart';
import 'package:agrolens/models/upload_response.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/inference_service.dart';
import 'package:agrolens/screens/inference_screen.dart';
import 'package:agrolens/screens/inference_viewer_screen.dart';
import 'package:image_picker/image_picker.dart';
import '../services/inference_test.dart' show TestAuth, uploadJson;

Json jobJson() => {
  'id': 'job',
  'status': 'completed',
  'sourceType': 'upload',
  'modelSnapshot': {'name': 'Pragas'},
  'imageCount': 1,
  'completedCount': 1,
  'failedCount': 0,
  'createdAt': '2026-10-05T12:00:00Z',
  'images': [
    {'id': 'a', 'fileName': 'a.jpg', 'status': 'completed'},
    {'id': 'b', 'fileName': 'b.jpg', 'status': 'completed'},
  ],
};

class _ImageClient implements HttpClient {
  @override
  Future<HttpClientRequest> getUrl(Uri url) async => _ImageRequest();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _ImageRequest implements HttpClientRequest {
  @override
  HttpHeaders get headers => _ImageHeaders();
  @override
  Future<HttpClientResponse> close() async => _ImageResponse();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _ImageHeaders implements HttpHeaders {
  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) {}
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _ImageResponse extends Stream<List<int>> implements HttpClientResponse {
  final bytes = File('web/favicon.png').readAsBytesSync();
  @override
  int get statusCode => 200;
  @override
  int get contentLength => bytes.length;
  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;
  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int>)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => Stream<List<int>>.value(bytes).listen(
    onData,
    onError: onError,
    onDone: onDone,
    cancelOnError: cancelOnError,
  );
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeInference extends InferenceService {
  FakeInference() : super(ApiClient(), TestAuth(ApiClient()));
  @override
  Future<Map<String, String>> propertyNames() async => {
    'property': 'Fazenda teste',
  };
  Completer<Json>? pendingHistory;
  Completer<InferenceResult>? pendingImage;
  Completer<String>? pendingSubmit;
  List<Json> historyJobs = [jobJson()];
  Json jobData = jobJson();
  int jobCalls = 0;
  int historyCalls = 0;
  final List<String> deletedJobs = [];
  final List<String> imageRequests = [];
  List<XFile> submittedFiles = [];
  @override
  Future<List<InferenceModel>> models() async => [
    InferenceModel.fromJson({
      'id': 'm',
      'name': 'Pragas',
      'classes': [
        {'id': 0, 'name': 'Gorgulho'},
      ],
    }),
  ];
  @override
  Future<Json> history(int offset) async {
    historyCalls++;
    return pendingHistory?.future ??
        {'jobs': historyJobs, 'total': historyJobs.length};
  }

  @override
  Future<void> delete(String id) async {
    deletedJobs.add(id);
    historyJobs.removeWhere((job) => job['id'] == id);
  }

  @override
  Future<String> submit({
    required String modelId,
    UploadDetail? upload,
    String? imageId,
    List<XFile> files = const [],
    required void Function(String) stage,
  }) async {
    submittedFiles = files;
    stage('Enviando imagem 1 de 1…');
    return pendingSubmit?.future ?? 'new-job';
  }

  @override
  Future<String?> cover(UploadDetail upload) async => null;
  @override
  Future<InferenceJob> job(String id) async {
    jobCalls++;
    return InferenceJob.fromJson(jobData);
  }

  @override
  Future<InferenceResult> image(String job, String image) async {
    imageRequests.add(image);
    if (pendingImage != null) return pendingImage!.future;
    return InferenceResult.fromJson({
      'id': image,
      'imageUrl': 'https://expired.test/$image',
      'detections': [],
    });
  }
}

void main() {
  testWidgets(
    'selection retains bounded previews, deduplicates by original size and submits original files',
    (tester) async {
      final original = File('web/icons/icon-512.png').absolute;
      final originalBytes = original.readAsBytesSync();
      const channel = MethodChannel('plugins.flutter.io/image_picker');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            expect(call.method, 'pickMultiImage');
            return [original.path];
          });
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null),
      );
      final service = FakeInference()..pendingSubmit = Completer<String>();
      await tester.pumpWidget(
        MaterialApp(home: InferenceScreen(service: service)),
      );
      await tester.pumpAndSettle();
      Future<void> pick() async {
        await tester.tap(find.text('Selecionar imagens'));
        await tester.pump();
        for (
          var attempt = 0;
          attempt < 100 && find.text('Selecionando…').evaluate().isNotEmpty;
          attempt++
        ) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 10)),
          );
          await tester.pump();
        }
        expect(find.text('Selecionando…'), findsNothing);
      }

      await pick();
      final preview = tester.widget<Image>(find.byType(Image));
      final source =
          (preview.image as ResizeImage).imageProvider as MemoryImage;
      expect(source.bytes.length, isNot(originalBytes.length));
      await tester.runAsync(() async {
        final codec = await ui.instantiateImageCodec(source.bytes);
        final image = (await codec.getNextFrame()).image;
        expect(image.width, lessThanOrEqualTo(360));
        expect(image.height, lessThanOrEqualTo(360));
        image.dispose();
        codec.dispose();
      });
      await pick();
      expect(find.text('1 imagem selecionada'), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
      await tester.ensureVisible(find.text('Executar inferência'));
      await tester.tap(find.text('Executar inferência'));
      await tester.pump();
      expect(service.submittedFiles.single.path, original.path);
      await tester.runAsync(() async {
        expect(
          await service.submittedFiles.single.readAsBytes(),
          originalBytes,
        );
      });
      service.pendingSubmit!.completeError(StateError('Stop test submission'));
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final popup in ['image dropdown', 'export menu']) {
    testWidgets('viewer polling resumes after $popup spans multiple ticks', (
      tester,
    ) async {
      final service = FakeInference()
        ..jobData = {
          ...jobJson(),
          'status': 'running',
          'images': [
            {'id': 'a', 'fileName': 'a.jpg', 'status': 'queued'},
            {'id': 'b', 'fileName': 'b.jpg', 'status': 'queued'},
          ],
        };
      await tester.pumpWidget(
        MaterialApp(
          home: InferenceViewerScreen(service: service, jobId: 'job'),
        ),
      );
      await tester.pumpAndSettle();
      expect(service.jobCalls, 1);
      if (popup == 'export menu') {
        await tester.tap(find.byTooltip('Exportar resultados'));
      } else {
        await tester.tap(find.byType(DropdownButtonFormField<String>));
      }
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 12));
      expect(service.jobCalls, 1);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 5));
      await tester.pump();
      expect(service.jobCalls, 2);
      service.jobData = {...service.jobData, 'status': 'completed'};
      await tester.pump(const Duration(seconds: 5));
      await tester.pump();
      expect(service.jobCalls, 3);
      await tester.pump(const Duration(seconds: 10));
      expect(service.jobCalls, 3);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets(
    'history polling resumes after cancelling a deletion dialog held across ticks',
    (tester) async {
      final service = FakeInference()
        ..historyJobs = [
          {...jobJson(), 'status': 'uploading'},
        ];
      await tester.pumpWidget(
        MaterialApp(home: InferenceScreen(service: service)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Histórico'));
      await tester.pumpAndSettle();
      final calls = service.historyCalls;
      await tester.tap(find.byTooltip('Excluir execução'));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 12));
      expect(service.historyCalls, calls);
      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 5));
      await tester.pump();
      expect(service.historyCalls, calls + 1);
      expect(service.deletedJobs, isEmpty);
      service.historyJobs = [jobJson()];
      await tester.pump(const Duration(seconds: 5));
      await tester.pump();
      expect(service.historyCalls, calls + 2);
      await tester.pump(const Duration(seconds: 10));
      expect(service.historyCalls, calls + 2);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  Future<void> startSubmission(
    WidgetTester tester,
    FakeInference service,
  ) async {
    service.pendingSubmit = Completer<String>();
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => InferenceScreen(
                    service: service,
                    initialUpload: UploadDetail.fromJson(uploadJson()),
                  ),
                ),
              ),
              child: const Text('Abrir inferência'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Abrir inferência'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Executar inferência'), 300);
    await tester.tap(find.text('Executar inferência'));
    await tester.pumpAndSettle();
  }

  for (final status in [
    'uploading',
    'queued',
    'running',
    'completed',
    'failed',
  ]) {
    testWidgets(
      'history deletion availability matches backend for $status jobs',
      (tester) async {
        final service = FakeInference()
          ..historyJobs = [
            {...jobJson(), 'status': status},
          ];
        await tester.pumpWidget(
          MaterialApp(home: InferenceScreen(service: service)),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Histórico'));
        await tester.pumpAndSettle();
        expect(
          find.byTooltip('Excluir execução'),
          status == 'queued' || status == 'running'
              ? findsNothing
              : findsOneWidget,
        );
        if (status == 'uploading') {
          expect(
            InferenceJob.fromJson(service.historyJobs.single).active,
            isTrue,
          );
        }
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets(
    'abandoned uploading job can be confirmed, deleted and removed from history',
    (tester) async {
      final service = FakeInference()
        ..historyJobs = [
          {...jobJson(), 'status': 'uploading'},
        ];
      await tester.pumpWidget(
        MaterialApp(home: InferenceScreen(service: service)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Histórico'));
      await tester.pumpAndSettle();
      final historyCalls = service.historyCalls;
      await tester.tap(find.byTooltip('Excluir execução'));
      await tester.pumpAndSettle();
      expect(service.deletedJobs, isEmpty);
      await tester.tap(find.widgetWithText(TextButton, 'Excluir'));
      await tester.pumpAndSettle();
      expect(service.deletedJobs, ['job']);
      expect(service.historyCalls, historyCalls + 1);
      expect(find.text('Ver resultados'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'arrow and system back cannot leave pending submission; success still opens results',
    (tester) async {
      final service = FakeInference();
      await startSubmission(tester, service);
      await tester.tap(find.byTooltip('Voltar'));
      await tester.pumpAndSettle();
      expect(find.byType(InferenceScreen), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(InferenceScreen), findsOneWidget);
      service.pendingSubmit!.complete('new-job');
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<InferenceViewerScreen>(find.byType(InferenceViewerScreen))
            .jobId,
        'new-job',
      );
      await tester.tap(find.byTooltip('Voltar'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Voltar'));
      await tester.pumpAndSettle();
      expect(find.text('Abrir inferência'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  for (final useSystemBack in [false, true]) {
    testWidgets(
      '${useSystemBack ? 'system' : 'arrow'} back is restored after submission fails',
      (tester) async {
        final service = FakeInference();
        await startSubmission(tester, service);
        service.pendingSubmit!.completeError(StateError('Upload failed'));
        await tester.pumpAndSettle();
        expect(find.byType(InferenceScreen), findsOneWidget);
        if (useSystemBack) {
          await tester.binding.handlePopRoute();
        } else {
          await tester.tap(find.byTooltip('Voltar'));
        }
        await tester.pumpAndSettle();
        expect(find.text('Abrir inferência'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('viewer fits images and zooms from native 100% down to 75%', (
    tester,
  ) async {
    debugNetworkImageHttpClientProvider = () => _ImageClient();
    addTearDown(() {
      debugNetworkImageHttpClientProvider = null;
      PaintingBinding.instance.imageCache.clear();
    });
    await tester.pumpWidget(
      MaterialApp(
        home: InferenceViewerScreen(service: FakeInference(), jobId: 'job'),
      ),
    );
    await tester.pump();
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsOneWidget);
    final viewer = tester.widget<InteractiveViewer>(
      find.byType(InteractiveViewer),
    );
    final controller = viewer.transformationController!;
    expect(controller.value.getMaxScaleOnAxis(), greaterThan(1));
    await tester.tap(find.textContaining('%').first);
    await tester.pumpAndSettle();
    expect(controller.value.getMaxScaleOnAxis(), 1);
    await tester.tap(find.byTooltip('Reduzir zoom'));
    await tester.pumpAndSettle();
    expect(controller.value.getMaxScaleOnAxis(), 0.75);
    expect(find.text('75%'), findsOneWidget);
    debugNetworkImageHttpClientProvider = null;
  });
  testWidgets(
    'phone setup shows classes, linked cover fallback and eligible action',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = FakeInference();
      await tester.pumpWidget(
        MaterialApp(
          home: InferenceScreen(
            service: service,
            initialUpload: UploadDetail.fromJson(uploadJson()),
            imageId: 'image-1',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Gorgulho'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Executar inferência'), 300);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Executar inferência'),
            )
            .onPressed,
        isNotNull,
      );
      expect(find.byType(UploadCover), findsOneWidget);
      expect(find.textContaining('1 imagem para analisar'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('history retains cards during refresh', (tester) async {
    final service = FakeInference();
    await tester.pumpWidget(
      MaterialApp(home: InferenceScreen(service: service)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Histórico'));
    await tester.pumpAndSettle();
    expect(find.text('Ver resultados'), findsOneWidget);
    service.pendingHistory = Completer<Json>();
    await tester.tap(find.byTooltip('Atualizar histórico'));
    await tester.pump();
    expect(find.text('Ver resultados'), findsOneWidget);
    service.pendingHistory!.complete({
      'jobs': [jobJson()],
      'total': 1,
    });
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'expired image retry clears the failed image while fresh API request is pending',
    (tester) async {
      final service = FakeInference();
      await tester.pumpWidget(
        MaterialApp(
          home: InferenceViewerScreen(service: service, jobId: 'job'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Carregar novamente'), findsOneWidget);
      service.pendingImage = Completer<InferenceResult>();
      await tester.tap(find.text('Carregar novamente'));
      await tester.pump();
      expect(service.imageRequests, ['a', 'a']);
      expect(find.byType(Image), findsNothing);
      expect(find.text('Carregar novamente'), findsNothing);
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Carregar novamente'), findsNothing);
      debugNetworkImageHttpClientProvider = () => _ImageClient();
      addTearDown(() {
        debugNetworkImageHttpClientProvider = null;
        PaintingBinding.instance.imageCache.clear();
      });
      service.pendingImage!.complete(
        InferenceResult.fromJson({
          'id': 'a',
          'imageUrl': 'https://fresh.test/a',
          'detections': [],
        }),
      );
      await tester.pump();
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pumpAndSettle();
      expect(find.text('Carregar novamente'), findsNothing);
      expect(find.byType(InteractiveViewer), findsOneWidget);
      expect(tester.takeException(), isNull);
      debugNetworkImageHttpClientProvider = null;
    },
  );
}
