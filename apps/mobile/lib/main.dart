import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'models/user.dart';
import 'services/api_client.dart';
import 'services/app_database.dart';
import 'services/auth_service.dart';
import 'services/database_helper.dart';
import 'services/local_image_store.dart';
import 'services/token_storage.dart';
import 'services/sync_service.dart';
import 'services/catalog_repository.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/home_screen.dart';
import 'utils/app_logger.dart';
import 'widgets/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Surface framework and uncaught async errors to the logger so field
  // failures reach the console/DevTools even without a crash SDK.
  FlutterError.onError = (details) {
    AppLogger.error(
      'Flutter framework error',
      details.exception,
      details.stack,
    );
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    AppLogger.error('Uncaught platform dispatcher error', error, stack);
    return true;
  };

  runApp(const AgroLensRefactorApp());
}

class AgroLensRefactorApp extends StatelessWidget {
  const AgroLensRefactorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AgroLens',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme(),
      darkTheme: AppTheme.darkTheme(),
      themeMode: ThemeMode.light,
      home: const AuthWrapper(),
    );
  }
}

/// Root widget that manages auth state and swaps between login/register/home.
class AuthWrapper extends StatefulWidget {
  final ApiClient? apiClient;
  final TokenStorage? tokenStorage;
  final AppDatabase? appDatabase;
  final LocalImageStore? imageStore;

  const AuthWrapper({
    super.key,
    this.apiClient,
    this.tokenStorage,
    this.appDatabase,
    this.imageStore,
  });

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  late final AppDatabase _appDatabase;
  late final ApiClient _apiClient;
  late final TokenStorage _tokenStorage;
  late final AuthService _authService;
  late final DatabaseHelper _databaseHelper;
  late final CatalogRepository _catalogRepository;
  late final SyncService _syncService;
  late final LocalImageStore _imageStore =
      widget.imageStore ?? createLocalImageStore();
  StreamSubscription<User?>? _authStateSubscription;

  bool _initializing = true;
  bool _showLogin = true;
  String? _syncOwnerId;
  int? _syncGeneration;

  @override
  void initState() {
    super.initState();
    _appDatabase = widget.appDatabase ?? AppDatabase();
    _apiClient = widget.apiClient ?? ApiClient();
    _tokenStorage = widget.tokenStorage ?? TokenStorage();
    _authService = AuthService(
      apiClient: _apiClient,
      tokenStorage: _tokenStorage,
    );
    _databaseHelper = DatabaseHelper(
      appDatabase: _appDatabase,
      authService: _authService,
    );
    _catalogRepository = CatalogRepository(
      appDatabase: _appDatabase,
      apiClient: _apiClient,
      authService: _authService,
    );
    _syncService = SyncService(
      apiClient: _apiClient,
      authService: _authService,
      databaseHelper: _databaseHelper,
      catalogRepository: _catalogRepository,
      imageStore: _imageStore,
    );

    _authStateSubscription = _authService.authStateChanges.listen((User? user) {
      if (user?.id != _syncOwnerId ||
          _syncGeneration != _authService.sessionGeneration) {
        _syncService.stop();
        if (mounted) {
          Navigator.of(context).popUntil((route) => route.isFirst);
        }
        _syncOwnerId = user?.id;
        _syncGeneration = _authService.sessionGeneration;
        if (user != null) {
          unawaited(_resetAndInitializeSync(user.id));
        }
      }
      if (mounted) {
        setState(() {
          _showLogin = user == null;
        });
      }
    });

    _initialize();
  }

  Future<void> _resetAndInitializeSync(String ownerId) async {
    final generation = _authService.sessionGeneration;
    try {
      await _databaseHelper.resetUploadingToPending();
    } catch (error, stack) {
      // DB might be first run; the retry state is corrected later anyway.
      AppLogger.warning('resetUploadingToPending failed', error, stack);
    }
    if (mounted &&
        _authService.currentUser?.id == ownerId &&
        _authService.sessionGeneration == generation) {
      _syncService.initialize();
    }
  }

  Future<void> _cleanupOrphans() async {
    try {
      await _databaseHelper.cleanupOrphanedImages(imageStore: _imageStore);
    } catch (error, stack) {
      AppLogger.warning('Orphan image cleanup failed', error, stack);
    }
  }

  Future<void> _initialize() async {
    // tryRestoreSession is offline-safe: bounded network timeout (7s) +
    // cached user fallback in secure storage, never throws on Socket/
    // Timeout/Http errors. Wrapper still catches unexpected failures so
    // the splash spinner can never hang.
    User? user;
    try {
      user = await _authService.tryRestoreSession();
    } catch (error, stack) {
      // Defensive: service is expected to swallow network errors, but any
      // storage/unknown throw is treated as offline without cached session.
      AppLogger.warning('Session restore threw unexpectedly', error, stack);
      user = _authService.currentUser;
    }
    // Service may have populated currentUser via its cache fallback
    // even when the returned user is null on non-401 errors.
    final effectiveUser = user ?? _authService.currentUser;
    if (effectiveUser != null) {
      await _cleanupOrphans();
    }
    if (mounted) {
      setState(() {
        _initializing = false;
        _showLogin = _authService.currentUser == null;
      });
    }
  }

  @override
  void dispose() {
    _authStateSubscription?.cancel();
    _syncService.dispose();
    _authService.dispose();
    _apiClient.dispose();
    _appDatabase.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    // If authenticated, show home
    if (_authService.currentUser != null) {
      return HomeScreen(
        key: ValueKey(_authService.currentUser!.id),
        authService: _authService,
        databaseHelper: _databaseHelper,
        catalogRepository: _catalogRepository,
        syncService: _syncService,
        imageStore: _imageStore,
      );
    }

    // Otherwise show login/register flow
    if (_showLogin) {
      return LoginScreen(
        authService: _authService,
        onRegisterTap: () => setState(() => _showLogin = false),
      );
    }

    return RegisterScreen(
      authService: _authService,
      onLoginTap: () => setState(() => _showLogin = true),
    );
  }
}
