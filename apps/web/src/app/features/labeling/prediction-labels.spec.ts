import { predictionLabels } from './prediction-labels';

describe('predictionLabels', () => {
  const detection = {
    classId: 7,
    className: 'weed',
    confidence: 0.9,
    xCenter: 0.5,
    yCenter: 0.4,
    width: 0.2,
    height: 0.1,
  };

  it('maps model IDs into the existing palette without mutating inputs or saving confidence', () => {
    const classes = ['crop', 'weed'];
    const converted = predictionLabels([detection], classes);
    expect(converted.classes).toEqual(classes);
    expect(converted.classes).not.toBe(classes);
    expect(converted.labels[0]).toEqual({
      classId: 1,
      className: 'weed',
      xCenter: 0.5,
      yCenter: 0.4,
      width: 0.2,
      height: 0.1,
    });
    expect(detection.classId).toBe(7);
    expect(detection.confidence).toBe(0.9);
  });

  it('adds missing classes once in a deterministic order', () => {
    const converted = predictionLabels(
      [detection, { ...detection, className: 'insect' }, detection],
      ['crop'],
    );
    expect(converted.classes).toEqual(['crop', 'weed', 'insect']);
    expect(converted.labels.map((label) => label.classId)).toEqual([1, 2, 1]);
  });

  it('keeps the palette for zero detections', () => {
    expect(predictionLabels([], ['crop'])).toEqual({ classes: ['crop'], labels: [] });
  });
});
