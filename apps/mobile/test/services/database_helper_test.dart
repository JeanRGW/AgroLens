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

class _ControlledDatabaseHelper extends DatabaseHelper {
  _ControlledDatabaseHelper({
    required super.appDatabase,
    required super.authService,
  });
  bool failSave = false;
  void Function()? afterRead;

  @override
  Future<PendingUpload?> getUploadById(String id) async {
    final upload = await super.getUploadById(id);
    afterRead?.call();
    return upload;
  }

  @override
  Future<int> insertPendingUpload(PendingUpload upload) {
    if (failSave) throw StateError('Queue commit failed');
    return super.insertPendingUpload(upload);
  }
}

class _FailingDeleteStore extends IoLocalImageStore {
  _FailingDeleteStore(Directory directory)
    : super(directory: () async => directory);

  @override
  Future<void> deleteImage(String path) async =>
      throw StateError('Deletion failed');
}

void main() {
  late _ControlledDatabaseHelper databaseHelper;
  late FakeAuthService authService;
  late Directory tempDir;

  setUp(() async {
    final appDb = createTestAppDatabase();
    final apiClient = ApiClient();
    authService = FakeAuthService(
      apiClient: apiClient,
      tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
    );
    databaseHelper = _ControlledDatabaseHelper(
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

  for (final failSave in [false, true]) {
    test(
      'removed draft originals are deleted only after a successful commit ($failSave)',
      () async {
        final store = IoLocalImageStore(directory: () async => tempDir);
        final removed = await File(
          '${tempDir.path}/removed.jpg',
        ).writeAsString('removed');
        final retained = await File(
          '${tempDir.path}/retained.jpg',
        ).writeAsString('retained');
        final draft = PendingUpload(
          id: 'removal',
          createdAt: DateTime.utc(2026),
          status: PendingUploadStatus.draft,
          paths: [removed.path, retained.path],
        );
        await databaseHelper.insertPendingUpload(draft);
        databaseHelper.failSave = failSave;
        final saving = databaseHelper.saveUploadImages(
          files: [],
          imageStore: store,
          createUpload: (_) => draft.copyWith(images: [draft.images.last]),
        );
        if (failSave) {
          await expectLater(saving, throwsStateError);
        } else {
          await saving;
        }
        expect(await removed.exists(), failSave);
        expect(await retained.exists(), isTrue);
        expect(
          (await databaseHelper.getDrafts()).single.paths,
          failSave ? draft.paths : [retained.path],
        );
      },
    );
  }

  test(
    'removal and discard preserve originals referenced by another account',
    () async {
      final store = IoLocalImageStore(directory: () async => tempDir);
      final shared = await File(
        '${tempDir.path}/shared.jpg',
      ).writeAsString('shared');
      final exclusive = await File(
        '${tempDir.path}/exclusive.jpg',
      ).writeAsString('exclusive');
      final draft = PendingUpload(
        id: 'removal',
        createdAt: DateTime.utc(2026),
        status: PendingUploadStatus.draft,
        paths: [shared.path, exclusive.path],
      );
      await databaseHelper.insertPendingUpload(draft);
      final peerAuth = FakeAuthService(
        apiClient: ApiClient(),
        tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
        userId: 'other',
      );
      final peer = DatabaseHelper(
        appDatabase: databaseHelper.database,
        authService: peerAuth,
      );
      try {
        await peer.insertPendingUpload(
          PendingUpload(
            id: 'peer',
            createdAt: DateTime.utc(2026),
            paths: [shared.path],
          ),
        );
        await databaseHelper.saveUploadImages(
          files: [],
          imageStore: store,
          createUpload: (_) => draft.copyWith(images: [draft.images.last]),
        );
        expect(await shared.exists(), isTrue);
        await databaseHelper.discardDraft(draft.id, imageStore: store);
        expect(await exclusive.exists(), isFalse);
        expect(await databaseHelper.getDrafts(), isEmpty);
        await databaseHelper.insertPendingUpload(
          draft.copyWith(images: [draft.images.first]),
        );
        await databaseHelper.discardDraft(draft.id, imageStore: store);
        expect(await shared.exists(), isTrue);
        expect((await peer.getAllUploads()).single.paths, [shared.path]);
      } finally {
        peerAuth.dispose();
      }
    },
  );

  test(
    'cleanup failure does not roll back originals in a committed replacement',
    () async {
      final store = _FailingDeleteStore(tempDir);
      final old = await File('${tempDir.path}/old.jpg').writeAsString('old');
      final draft = PendingUpload(
        id: 'replacement',
        createdAt: DateTime.utc(2026),
        status: PendingUploadStatus.draft,
        paths: [old.path],
      );
      await databaseHelper.insertPendingUpload(draft);
      final saved = await databaseHelper.saveUploadImages(
        files: [
          XFile.fromData(
            Uint8List.fromList([0xff, 0xd8, 0xff]),
            name: 'new.jpg',
          ),
        ],
        imageStore: store,
        createUpload: (paths) => draft.copyWith(paths: paths),
      );
      expect((await databaseHelper.getDrafts()).single.paths, saved.paths);
      expect(await store.readBytes(saved.paths.single), [0xff, 0xd8, 0xff]);
      expect(await old.exists(), isTrue);
      expect(
        await databaseHelper.cleanupOrphanedImages(
          imageStore: IoLocalImageStore(directory: () async => tempDir),
        ),
        1,
      );
      expect(await old.exists(), isFalse);
    },
  );

  test(
    'discard refuses finalized uploads and cannot delete another account draft',
    () async {
      final store = IoLocalImageStore(directory: () async => tempDir);
      final photo = await File(
        '${tempDir.path}/owned.jpg',
      ).writeAsString('owned');
      final upload = PendingUpload(
        id: 'owned',
        createdAt: DateTime.utc(2026),
        paths: [photo.path],
      );
      await databaseHelper.insertPendingUpload(upload);
      await expectLater(
        databaseHelper.discardDraft(upload.id, imageStore: store),
        throwsStateError,
      );
      await databaseHelper.updateUpload(
        upload.copyWith(status: PendingUploadStatus.draft),
      );
      final peerAuth = FakeAuthService(
        apiClient: ApiClient(),
        tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
        userId: 'other',
      );
      final peer = DatabaseHelper(
        appDatabase: databaseHelper.database,
        authService: peerAuth,
      );
      try {
        await peer.discardDraft(upload.id, imageStore: store);
        expect(await databaseHelper.getDrafts(), hasLength(1));
        expect(await photo.exists(), isTrue);
      } finally {
        peerAuth.dispose();
      }
    },
  );

  for (final discard in [false, true]) {
    test(
      'session changes during draft lookup abort ${discard ? 'discard' : 'replacement'}',
      () async {
        final store = IoLocalImageStore(directory: () async => tempDir);
        final original = await File(
          '${tempDir.path}/owned.jpg',
        ).writeAsString('owned');
        final draft = PendingUpload(
          id: 'owned',
          createdAt: DateTime.utc(2026),
          status: PendingUploadStatus.draft,
          paths: [original.path],
        );
        await databaseHelper.insertPendingUpload(draft);
        databaseHelper.afterRead = () => authService.setAuthenticated(false);
        if (discard) {
          await expectLater(
            databaseHelper.discardDraft(draft.id, imageStore: store),
            throwsStateError,
          );
        } else {
          await expectLater(
            databaseHelper.saveUploadImages(
              files: [
                XFile.fromData(
                  Uint8List.fromList([0xff, 0xd8, 0xff]),
                  name: 'new.jpg',
                ),
              ],
              imageStore: store,
              createUpload: (paths) => draft.copyWith(paths: paths),
            ),
            throwsStateError,
          );
        }
        databaseHelper.afterRead = null;
        authService.setAuthenticated(true);
        expect((await databaseHelper.getDrafts()).single.paths, draft.paths);
        expect((await store.listPaths()).map(store.comparisonKey), [
          store.comparisonKey(original.path),
        ]);
      },
    );
  }

  test(
    'draft photos and metadata survive reopening, logout, and orphan cleanup',
    () async {
      final path = '${tempDir.path}/draft.sqlite';
      final photos = await Directory('${tempDir.path}/photos').create();
      final store = IoLocalImageStore(directory: () async => photos);
      final first = DatabaseHelper(
        appDatabase: createTestAppDatabase(path: path),
        authService: authService,
      );
      final saved = await first.saveUploadImages(
        files: [
          XFile.fromData(
            Uint8List.fromList([0xff, 0xd8, 0xff]),
            name: 'photo.jpg',
          ),
        ],
        imageStore: store,
        createUpload: (paths) => PendingUpload(
          id: 'draft',
          ownerId: 'user-1',
          paths: paths,
          latitude: -23,
          longitude: -46,
          createdAt: DateTime.utc(2026),
          status: PendingUploadStatus.draft,
          propertyId: 'p',
          talhaoId: 't',
          cropTypeId: 'c',
          source: 'phone',
        ),
      );
      await first.close();
      authService.setAuthenticated(false);
      authService.setAuthenticated(true);
      final reopened = DatabaseHelper(
        appDatabase: createTestAppDatabase(path: path),
        authService: authService,
      );
      try {
        final draft = (await reopened.getDrafts()).single;
        expect(draft.toSqliteRow(), saved.toSqliteRow());
        expect(await reopened.getAllUploads(), isEmpty);
        expect(await reopened.getPendingAndFailedUploads(), isEmpty);
        expect(await reopened.cleanupOrphanedImages(imageStore: store), 0);
        expect(await store.readBytes(draft.paths.single), [0xff, 0xd8, 0xff]);
        final otherAuth = FakeAuthService(
          apiClient: ApiClient(),
          tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
          userId: 'other',
        );
        final other = DatabaseHelper(
          appDatabase: reopened.database,
          authService: otherAuth,
        );
        expect(await other.getDrafts(), isEmpty);
        expect(await other.getUploadById(draft.id), isNull);
        expect(await other.deleteUpload(draft.id), 0);
        expect(await store.exists(draft.paths.single), isTrue);
        otherAuth.dispose();
      } finally {
        await reopened.close();
      }
    },
  );

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
