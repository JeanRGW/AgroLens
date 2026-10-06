import 'dart:io';
import 'dart:ui';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

Future<String?> saveInferenceExport(
  String name,
  String content, {
  required Rect sharePositionOrigin,
}) async {
  final directory = await getTemporaryDirectory();
  final file = File('${directory.path}/$name');
  await file.writeAsString(content);
  final result = await SharePlus.instance.share(
    ShareParams(
      files: [
        XFile(
          file.path,
          mimeType: name.endsWith('.json') ? 'application/json' : 'text/csv',
        ),
      ],
      sharePositionOrigin: sharePositionOrigin,
    ),
  );
  return result.status == ShareResultStatus.success
      ? 'Exportação enviada para o aplicativo selecionado.'
      : null;
}
