import 'package:http/http.dart' as http;

/// On web, every transport failure surfaces as [http.ClientException]
/// (BrowserClient wraps fetch/XHR errors).
bool isConnectionError(Object error) => error is http.ClientException;

/// IndexedDB access failures are not modeled as file errors on web.
bool isLocalFileError(Object error) => false;

String platformErrorMessage(Object error) {
  if (error is http.ClientException) return error.message;
  return error.toString();
}
