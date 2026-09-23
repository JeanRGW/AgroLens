import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:agrolens/models/pending_upload.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/token_storage.dart';
import '../helpers/test_doubles.dart';

void main() {
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

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

  test('cleanupOrphanedImages removes unreferenced files', () async {
    final activeFile = File('${tempDir.path}/active.jpg');
    await activeFile.writeAsString('active');

    final orphanFile = File('${tempDir.path}/orphan.jpg');
    await orphanFile.writeAsString('orphan');

    final upload = PendingUpload(
      id: 'active-upload',
      paths: [activeFile.path],
      latitude: 0,
      longitude: 0,
      createdAt: DateTime.now(),
    );
    await databaseHelper.insertPendingUpload(upload);

    final deleted = await databaseHelper.cleanupOrphanedImages(
      imagesDirectory: tempDir,
    );

    expect(deleted, 1);
    expect(await activeFile.exists(), isTrue);
    expect(await orphanFile.exists(), isFalse);
  });
}
