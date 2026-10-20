import type { Detection, YoloLabel } from '@agrolens/contracts';

export function predictionLabels(
  detections: readonly Detection[],
  existingClasses: readonly string[],
): { classes: string[]; labels: YoloLabel[] } {
  const classes = [...existingClasses];
  const labels = detections.map(({ className, xCenter, yCenter, width, height }) => {
    if (!classes.includes(className)) classes.push(className);
    return { classId: classes.indexOf(className), className, xCenter, yCenter, width, height };
  });
  return { classes, labels };
}
