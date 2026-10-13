import 'dart:math' as math;
import '../models/inference.dart';

double intersectionOverUnion(Detection a, Detection b) {
  final width = math.max(
    0.0,
    math.min(a.xCenter + a.width / 2, b.xCenter + b.width / 2) -
        math.max(a.xCenter - a.width / 2, b.xCenter - b.width / 2),
  );
  final height = math.max(
    0.0,
    math.min(a.yCenter + a.height / 2, b.yCenter + b.height / 2) -
        math.max(a.yCenter - a.height / 2, b.yCenter - b.height / 2),
  );
  final intersection = width * height;
  final union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

List<Detection> filterDetections(
  List<Detection> boxes, {
  double minConfidence = 0.25,
  bool suppressOverlaps = false,
  double iouThreshold = 0.5,
}) {
  final indices = List<int>.generate(boxes.length, (i) => i)
      .where(
        (i) =>
            boxes[i].confidence == null ||
            boxes[i].confidence! >= minConfidence,
      )
      .toList();
  if (!suppressOverlaps) return indices.map((i) => boxes[i]).toList();
  indices.sort(
    (a, b) =>
        (boxes[b].confidence ?? 1).compareTo(boxes[a].confidence ?? 1) != 0
        ? (boxes[b].confidence ?? 1).compareTo(boxes[a].confidence ?? 1)
        : a.compareTo(b),
  );
  final kept = <int>[];
  for (final i in indices) {
    if (boxes[i].confidence == null ||
        !kept.any(
          (j) =>
              boxes[j].confidence != null &&
              boxes[j].classId == boxes[i].classId &&
              intersectionOverUnion(boxes[j], boxes[i]) > iouThreshold,
        )) {
      kept.add(i);
    }
  }
  kept.sort();
  return kept.map((i) => boxes[i]).toList();
}
