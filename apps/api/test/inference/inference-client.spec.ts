import { ConfigService } from '@nestjs/config';
import { InferenceClient } from '../../src/inference/inference-client';

describe('InferenceClient contract', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the prediction form and allows model download time to complete', async () => {
    const response = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        detections: [],
        width: 10,
        height: 20,
        inferenceMs: 3,
      }),
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response as unknown as Response);
    const timeoutMock = jest.spyOn(AbortSignal, 'timeout');
    const client = new InferenceClient(
      new ConfigService({ INFERENCE_SERVICE_URL: 'http://inference:8000' }),
    );

    await expect(
      client.predict(Buffer.from('image'), 'http://garage:3900/model.pt', 'abc'),
    ).resolves.toEqual(expect.objectContaining({ width: 10, height: 20 }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://inference:8000/predict');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('model_url')).toBe('http://garage:3900/model.pt');
    expect((init?.body as FormData).get('model_checksum')).toBe('abc');
    expect(timeoutMock).toHaveBeenCalledWith(360_000);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(['inspect', 'predict'] as const)(
    'cancels an in-flight %s request when shutdown draining expires',
    async (operation) => {
      let ready!: () => void;
      const started = new Promise<void>((resolve) => {
        ready = resolve;
      });
      jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
        const signal = init!.signal!;
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          ready();
        });
      });
      const client = new InferenceClient(new ConfigService());
      const shutdown = new AbortController();
      const result =
        operation === 'inspect'
          ? client.inspectModel('http://garage/model', shutdown.signal)
          : client.predict(Buffer.from('image'), 'http://garage/model', 'abc', shutdown.signal);
      const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
      await started;
      shutdown.abort();
      await assertion;
    },
  );
});
