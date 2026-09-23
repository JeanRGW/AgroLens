import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../utils/app_logger.dart';

/// Monitors device connectivity state and provides debounced online status events.
class ConnectivityMonitor {
  final Connectivity _connectivity;
  final Stream<List<ConnectivityResult>>? connectivityChanges;
  final Future<List<ConnectivityResult>> Function() _checkConnectivity;
  final Duration debounceDuration;

  StreamSubscription<List<ConnectivityResult>>? _subscription;
  Timer? _debounceTimer;
  bool _initialized = false;
  bool _disposed = false;
  int _generation = 0;

  final StreamController<bool> _connectionStatusController =
      StreamController<bool>.broadcast();

  Stream<bool> get connectionStatus => _connectionStatusController.stream;

  ConnectivityMonitor({
    Connectivity? connectivity,
    this.connectivityChanges,
    Future<List<ConnectivityResult>> Function()? checkConnectivity,
    this.debounceDuration = const Duration(milliseconds: 250),
  }) : _connectivity = connectivity ?? Connectivity(),
       _checkConnectivity =
           checkConnectivity ??
           (connectivity ?? Connectivity()).checkConnectivity;

  /// Start listening to connectivity events. Calls [onOnline] when connection is restored.
  void start({required void Function() onOnline}) {
    if (_initialized || _disposed) return;
    _initialized = true;

    // Check initial connectivity
    unawaited(_checkInitial(onOnline, _generation));

    // Listen for changes
    _subscription = (connectivityChanges ?? _connectivity.onConnectivityChanged)
        .listen((results) {
          final online = hasInternet(results);
          _debounceTimer?.cancel();
          if (!_disposed && !_connectionStatusController.isClosed) {
            _connectionStatusController.add(online);
          }
          if (online) {
            _debounceTimer?.cancel();
            if (debounceDuration == Duration.zero) {
              if (!_disposed) onOnline();
            } else {
              _debounceTimer = Timer(debounceDuration, () {
                if (!_disposed) onOnline();
              });
            }
          }
        });
  }

  Future<void> _checkInitial(void Function() onOnline, int generation) async {
    final List<ConnectivityResult> results;
    try {
      results = await _checkConnectivity();
    } catch (error, stack) {
      AppLogger.warning('Initial connectivity check failed', error, stack);
      return;
    }
    if (_disposed || !_initialized || generation != _generation) return;
    final online = hasInternet(results);
    // Always emit the initial state so consumers start with an accurate
    // online/offline value instead of assuming connectivity.
    if (!_disposed && !_connectionStatusController.isClosed) {
      _connectionStatusController.add(online);
    }
    if (online) {
      onOnline();
    }
  }

  /// Returns true if at least one internet bearer is active.
  bool hasInternet(List<ConnectivityResult> results) {
    if (results.isEmpty || results.contains(ConnectivityResult.none)) {
      return false;
    }
    return results.any(
      (r) =>
          r == ConnectivityResult.wifi ||
          r == ConnectivityResult.mobile ||
          r == ConnectivityResult.ethernet ||
          r == ConnectivityResult.vpn,
    );
  }

  /// Temporarily stop monitoring (e.g. on logout).
  void stop() {
    _generation++;
    _debounceTimer?.cancel();
    _debounceTimer = null;
    _subscription?.cancel();
    _subscription = null;
    _initialized = false;
  }

  /// Permanently dispose monitor resources.
  void dispose() {
    stop();
    _disposed = true;
    if (!_connectionStatusController.isClosed) {
      _connectionStatusController.close();
    }
  }
}
