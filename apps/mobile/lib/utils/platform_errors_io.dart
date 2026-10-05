import 'dart:io';
import 'package:http/http.dart' as http;

bool isConnectionError(Object error) =>
    error is SocketException ||
    error is HttpException ||
    error is http.ClientException;

bool isLocalFileError(Object error) => error is FileSystemException;

String platformErrorMessage(Object error) {
  if (error is SocketException) return error.message;
  if (error is HttpException) return error.message;
  if (error is http.ClientException) return error.message;
  return error.toString();
}
