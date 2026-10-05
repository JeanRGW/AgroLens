import 'dart:io';
import 'package:agrolens/utils/save_inference_export_native.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const pathsChannel = MethodChannel('plugins.flutter.io/path_provider');
  const shareChannel = MethodChannel('dev.fluttercommunity.plus/share');
  const origin = Rect.fromLTWH(300, 20, 40, 40);
  late Directory directory;
  late List<MethodCall> shareCalls;
  late List<String> pathCalls;
  String? shareResult;

  setUp(() {
    directory = Directory.systemTemp.createTempSync('agrolens-export-');
    shareCalls = [];
    pathCalls = [];
    shareResult = 'com.example.share-target';
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(pathsChannel, (call) async {
      pathCalls.add(call.method);
      return directory.path;
    });
    messenger.setMockMethodCallHandler(shareChannel, (call) async {
      shareCalls.add(call);
      return shareResult;
    });
  });

  tearDown(() {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(pathsChannel, null);
    messenger.setMockMethodCallHandler(shareChannel, null);
    directory.deleteSync(recursive: true);
  });

  for (final format in ['json', 'csv']) {
    test(
      'native $format export shares a readable temporary file with its name, MIME type and iPad anchor',
      () async {
        final name = 'inference-job.$format';
        final content = format == 'json'
            ? '{"className":"Gorgulho"}'
            : 'className,confidence\r\nGorgulho,0.9';
        final message = await saveInferenceExport(
          name,
          content,
          sharePositionOrigin: origin,
        );
        expect(pathCalls, ['getTemporaryDirectory']);
        expect(shareCalls.single.method, 'share');
        final arguments = Map<String, dynamic>.from(
          shareCalls.single.arguments as Map,
        );
        final path = (arguments['paths'] as List).single as String;
        expect(path, '${directory.path}/$name');
        expect(await File(path).readAsString(), content);
        expect(arguments['mimeTypes'], [
          format == 'json' ? 'application/json' : 'text/csv',
        ]);
        expect(arguments['originX'], origin.left);
        expect(arguments['originY'], origin.top);
        expect(arguments['originWidth'], origin.width);
        expect(arguments['originHeight'], origin.height);
        expect(message, 'Exportação enviada para o aplicativo selecionado.');
        expect(message, isNot(contains(directory.path)));
      },
    );
  }

  for (final result in ['', 'dev.fluttercommunity.plus/share/unavailable']) {
    test(
      'dismissed or unavailable sharing does not report a saved export ($result)',
      () async {
        shareResult = result;
        expect(
          await saveInferenceExport(
            'inference-job.json',
            '{}',
            sharePositionOrigin: origin,
          ),
          isNull,
        );
        expect(shareCalls, hasLength(1));
      },
    );
  }

  test(
    'share-sheet errors propagate to the existing export error handler',
    () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            shareChannel,
            (_) async => throw PlatformException(code: 'share_failed'),
          );
      await expectLater(
        saveInferenceExport(
          'inference-job.json',
          '{}',
          sharePositionOrigin: origin,
        ),
        throwsA(isA<PlatformException>()),
      );
    },
  );
}
