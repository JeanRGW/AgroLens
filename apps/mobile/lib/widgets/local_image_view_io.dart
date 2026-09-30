import 'dart:io';
import 'package:flutter/widgets.dart';
import 'package:image_picker/image_picker.dart';

import '../services/local_image_store_base.dart';

/// Renders an image previously saved in [store] at [path].
Widget storedImageView(
  LocalImageStore store,
  String path, {
  BoxFit? fit,
  double? width,
  double? height,
  int? cacheWidth,
  ImageErrorWidgetBuilder? errorBuilder,
}) => Image.file(
  File(path),
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
}) => Image.file(
  File(file.path),
  fit: fit,
  width: width,
  height: height,
  cacheWidth: cacheWidth,
  errorBuilder: errorBuilder,
);
