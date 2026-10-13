import { ConfigService } from '@nestjs/config';
import { InferenceJobService } from '../../src/inference/inference-job.service';
import type {
  InferenceRepository,
  InferenceModelsRepository,
  UploadsRepository,
  AccessRepository,
} from '../../src/database/repositories';
import type { StorageService } from '../../src/storage/storage.service';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';
const box = {
  classId: 0,
  className: 'corn',
  confidence: 0.9,
  xCenter: 0.5,
  yCenter: 0.5,
  width: 0.2,
  height: 0.2,
};
describe('inference review authorization and validation', () => {
  const repo = {
    findJobById: jest.fn(),
    listImagesByJobId: jest.fn(),
    findImageById: jest.fn(),
    saveReview: jest.fn(),
  };
  let service: InferenceJobService;
  const user = { sub: 'owner', role: 'user' } as AuthenticatedUser;
  const dto = {
    expectedUpdatedAt: new Date('2026-10-13T00:00:00Z'),
    detections: [{ ...box, confidence: null }],
  };
  beforeEach(() => {
    jest.clearAllMocks();
    repo.findJobById.mockResolvedValue({
      id: 'job',
      userId: 'owner',
      sourceType: 'temporary',
      modelSnapshot: { classes: [{ id: 0, name: 'corn' }] },
    });
    repo.listImagesByJobId.mockResolvedValue([]);
    repo.findImageById.mockResolvedValue({ detections: [box] });
    repo.saveReview.mockResolvedValue({
      reviewedDetections: dto.detections,
      updatedAt: new Date(),
    });
    service = new InferenceJobService(
      new ConfigService(),
      repo as unknown as InferenceRepository,
      {} as InferenceModelsRepository,
      {} as UploadsRepository,
      {} as AccessRepository,
      {} as StorageService,
    );
  });
  it('saves manual snapshots without changing model output', async () => {
    const result = await service.saveReview('job', 'image', dto, user);
    expect(result.reviewedDetections).toEqual(dto.detections);
    expect(repo.saveReview).toHaveBeenCalledWith(
      'job',
      'image',
      dto.expectedUpdatedAt,
      dto.detections,
      'owner',
    );
  });
  it('allows admin access but rejects other users', async () => {
    await expect(
      service.saveReview('job', 'image', dto, { ...user, sub: 'other' }),
    ).rejects.toThrow('access');
    expect(repo.saveReview).not.toHaveBeenCalled();
    await expect(
      service.saveReview('job', 'image', dto, { ...user, sub: 'admin', role: 'admin' }),
    ).resolves.toBeDefined();
  });
  it('rejects classes outside the model snapshot', async () => {
    await expect(
      service.saveReview(
        'job',
        'image',
        { ...dto, detections: [{ ...box, confidence: null, className: 'weed' }] },
        user,
      ),
    ).rejects.toThrow('classes');
    expect(repo.saveReview).not.toHaveBeenCalled();
  });
  it('rejects invented confidence and allows unchanged model boxes', async () => {
    await expect(
      service.saveReview('job', 'image', { ...dto, detections: [{ ...box, xCenter: 0.6 }] }, user),
    ).rejects.toThrow('null confidence');
    await expect(
      service.saveReview('job', 'image', { ...dto, detections: [box] }, user),
    ).resolves.toBeDefined();
  });
  it.each([null, []])('supports restoring or removing all detections: %j', async (detections) => {
    await service.saveReview('job', 'image', { ...dto, detections }, user);
    expect(repo.saveReview).toHaveBeenCalledWith(
      'job',
      'image',
      dto.expectedUpdatedAt,
      detections,
      'owner',
    );
  });
});
