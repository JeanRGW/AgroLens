import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/models/inference.dart';
import 'package:agrolens/utils/detection_filters.dart';

void main() {
  final fixtures =
      jsonDecode(
            File(
              '../../packages/contracts/test/fixtures/detection-filters.json',
            ).readAsStringSync(),
          )
          as List;
  for (final fixture in fixtures) {
    test(fixture['name'] as String, () {
      final boxes = (fixture['boxes'] as List)
          .map(
            (values) => Detection.fromJson({
              'classId': values[0],
              'className': '${values[0]}',
              'confidence': values[1],
              'xCenter': values[2],
              'yCenter': values[3],
              'width': values[4],
              'height': values[5],
            }),
          )
          .toList();
      final result = filterDetections(
        boxes,
        minConfidence: (fixture['minimum'] as num).toDouble(),
        suppressOverlaps: fixture['enabled'] as bool,
        iouThreshold: (fixture['threshold'] as num).toDouble(),
      );
      expect(result.map(boxes.indexOf).toList(), fixture['kept']);
    });
  }
  test(
    'empty saved review is distinct from absence and manual confidence stays null',
    () {
      final raw = {'id': 'image', 'imageUrl': 'url', 'detections': []};
      expect(InferenceResult.fromJson(raw).reviewedDetections, isNull);
      expect(
        InferenceResult.fromJson({
          ...raw,
          'reviewedDetections': [],
        }).reviewedDetections,
        isEmpty,
      );
      final box = Detection.fromJson({
        'classId': 0,
        'className': 'corn',
        'confidence': null,
        'xCenter': 0.5,
        'yCenter': 0.5,
        'width': 0.2,
        'height': 0.2,
      });
      expect(box.toJson()['confidence'], isNull);
    },
  );
}
