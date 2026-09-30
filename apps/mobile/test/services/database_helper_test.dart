import 'dart:io';
import 'dart:typed_data';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/models/pending_upload.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/local_image_store.dart';
import 'package:agrolens/services/token_storage.dart';
import '../helpers/test_doubles.dart';

void main() {
  late DatabaseHelper databaseHelper;
  late FakeAuthService authService;
  late Directory tempDir;

  setUp(() async {
    final appDb = createTestAppDatabase();
    final apiClient = ApiClient();
    authService = FakeAuthService(
      apiClient: apiClient,
      tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
    );
    databaseHelper = DatabaseHelper(
      appDatabase: appDb,
      authService: authService,
    );
    tempDir = await Directory.systemTemp.createTemp('agrolens_orphan_test_');
  });

  tearDown(() async {
    await databaseHelper.close();
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  test('changes stream emits event on database mutations', () async {
    final events = <void>[];
    final sub = databaseHelper.changes.listen(events.add);

    final upload = PendingUpload(
      id: 'upload-1',
      paths: ['/path/1.jpg'],
      latitude: 0,
      longitude: 0,
      createdAt: DateTime.now(),
    );

    await databaseHelper.insertPendingUpload(upload);
    await databaseHelper.updateUpload(
      upload.copyWith(status: PendingUploadStatus.uploading),
    );
    await databaseHelper.resetUploadingToPending();
    await databaseHelper.deleteUpload('upload-1');

    await Future.delayed(const Duration(milliseconds: 20));
    expect(events.length, 4);

    await sub.cancel();
  });

  for (final relativePath in ['active.jpg', './active.jpg']) {
    test('cleanupOrphanedImages preserves referenced $relativePath', () async {
      final activeFile = File('${tempDir.path}/active.jpg');
      await activeFile.writeAsString('active');

      final orphanFile = File('${tempDir.path}/orphan.jpg');
      await orphanFile.writeAsString('orphan');

      final upload = PendingUpload(
        id: 'active-upload',
        paths: ['${tempDir.path}/$relativePath'],
        latitude: 0,
        longitude: 0,
        createdAt: DateTime.now(),
      );
      await databaseHelper.insertPendingUpload(upload);

      final deleted = await databaseHelper.cleanupOrphanedImages(
        imageStore: IoLocalImageStore(directory: () async => tempDir),
      );

      expect(deleted, 1);
      expect(await activeFile.exists(), isTrue);
      expect(await orphanFile.exists(), isFalse);
    });
  }

  test('Drift queue persists image identities across reopening', () async {
    final path = '${tempDir.path}/queue.sqlite';
    final first = createTestAppDatabase(path: path);
    final helper = DatabaseHelper(appDatabase: first, authService: authService);
    final upload = PendingUpload(
      id: 'stable',
      paths: ['/photos/one.jpg'],
      createdAt: DateTime.now(),
    );
    await helper.insertPendingUpload(upload);
    await helper.close();
    final second = createTestAppDatabase(path: path);
    final reopened = DatabaseHelper(
      appDatabase: second,
      authService: authService,
    );
    try {
      final saved = await reopened.getUploadById('stable');
      expect(saved!.images.single.imageId, upload.images.single.imageId);
      expect(saved.paths, upload.paths);
    } finally {
      await reopened.close();
    }
  });

  test(
    'failed queue persistence rolls back originals before releasing the save',
    () async {
      final store = IoLocalImageStore(directory: () async => tempDir);
      await expectLater(
        databaseHelper.saveUploadImages(
          files: [
            XFile.fromData(
              Uint8List.fromList([0xff, 0xd8, 0xff]),
              name: 'photo.jpg',
            ),
          ],
          imageStore: store,
          createUpload: (_) => throw StateError('Session changed'),
        ),
        throwsStateError,
      );
      expect(await store.listPaths(), isEmpty);
      expect(await databaseHelper.getAllUploads(), isEmpty);
    },
  );

  test(
    'HEIC originals are rejected without saving a file or queue row',
    () async {
      final store = IoLocalImageStore(directory: () async => tempDir);
      await expectLater(
        databaseHelper.saveUploadImages(
          files: [
            XFile.fromData(
              Uint8List.fromList([0, 0, 0, 24, ...'ftypheic'.codeUnits]),
              name: 'photo.jpg',
            ),
          ],
          imageStore: store,
          createUpload: (paths) => PendingUpload(
            id: 'unsupported',
            paths: paths,
            createdAt: DateTime.now(),
          ),
        ),
        throwsFormatException,
      );
      expect(await store.listPaths(), isEmpty);
      expect(await databaseHelper.getAllUploads(), isEmpty);
    },
  );
}
