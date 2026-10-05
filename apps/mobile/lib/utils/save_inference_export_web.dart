import 'dart:js_interop';
import 'dart:ui';
import 'package:web/web.dart' as web;

Future<String?> saveInferenceExport(
  String name,
  String content, {
  required Rect sharePositionOrigin,
}) async {
  final blob = web.Blob(
    [content.toJS].toJS,
    web.BlobPropertyBag(
      type: name.endsWith('.json')
          ? 'application/json'
          : 'text/csv;charset=utf-8',
    ),
  );
  final url = web.URL.createObjectURL(blob);
  final anchor = web.HTMLAnchorElement()
    ..href = url
    ..download = name;
  web.document.body!.append(anchor);
  anchor.click();
  anchor.remove();
  // Allow the browser to begin consuming the download before releasing it.
  Future<void>.delayed(
    const Duration(seconds: 1),
    () => web.URL.revokeObjectURL(url),
  );
  return 'Download iniciado.';
}
