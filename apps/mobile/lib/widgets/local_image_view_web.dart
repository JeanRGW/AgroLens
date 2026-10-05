import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/local_image_store_base.dart';

/// Renders an image previously saved in [store] at [path] (bytes from
/// IndexedDB decoded via `Image.memory`).
Widget storedImageView(
  LocalImageStore store,
  String path, {
  BoxFit? fit,
  double? width,
  double? height,
  int? cacheWidth,
  ImageErrorWidgetBuilder? errorBuilder,
}) => _bytesImageView(
  store.readBytes(path),
  fit: fit,
  width: width,
  height: height,
  cacheWidth: cacheWidth,
  errorBuilder: errorBuilder,
);

/// Renders a picked (not yet persisted) [file].
Widget pickedImageView(
  XFile file, {
  BoxFit? fit,
  double? width,
  double? height,
  int? cacheWidth,
  ImageErrorWidgetBuilder? errorBuilder,
}) => _bytesImageView(
  file.readAsBytes(),
  fit: fit,
  width: width,
  height: height,
  cacheWidth: cacheWidth,
  errorBuilder: errorBuilder,
);

Widget _bytesImageView(
  Future<Uint8List> bytes, {
  BoxFit? fit,
  double? width,
  double? height,
  int? cacheWidth,
  ImageErrorWidgetBuilder? errorBuilder,
}) => FutureBuilder<Uint8List>(
  future: bytes,
  builder: (context, snapshot) {
    if (snapshot.hasData) {
      return Image.memory(
        snapshot.data!,
        fit: fit,
        width: width,
        height: height,
        cacheWidth: cacheWidth,
        errorBuilder: errorBuilder,
      );
    }
    if (snapshot.hasError) {
      if (errorBuilder != null) {
        return errorBuilder(context, snapshot.error!, snapshot.stackTrace);
      }
      return SizedBox(width: width, height: height);
    }
    return SizedBox(
      width: width,
      height: height,
      child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
    );
  },
);
