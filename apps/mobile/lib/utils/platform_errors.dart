import 'platform_errors_io.dart'
    if (dart.library.html) 'platform_errors_web.dart'
    as platform;

/// Whether [error] is a transport-level connection failure (no route to
/// host, DNS failure, reset connection, browser fetch failure...).
bool isConnectionError(Object error) => platform.isConnectionError(error);

/// Whether [error] is a local file/storage access failure (missing or
/// locked file, deleted mid-upload...).
bool isLocalFileError(Object error) => platform.isLocalFileError(error);

/// Human-readable message for a platform-level [error].
String platformErrorMessage(Object error) =>
    platform.platformErrorMessage(error);
