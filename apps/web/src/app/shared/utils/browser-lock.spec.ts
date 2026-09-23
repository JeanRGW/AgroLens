import { withBrowserLock } from './browser-lock';

describe('withBrowserLock fallback', () => {
  it('serializes one batch across failures while allowing other batches to proceed', async () => {
    spyOnProperty(navigator as { locks?: LockManager }, 'locks', 'get').and.returnValue(undefined);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const events: string[] = [];
    const first = withBrowserLock('batch-1', async () => {
      events.push('sync started');
      await gate;
      events.push('sync failed');
      throw new Error('timeout');
    }).catch((error: unknown) => error);
    const removal = withBrowserLock('batch-1', async () => {
      events.push('deleted');
    });

    await withBrowserLock('batch-2', async () => events.push('other batch'));
    expect(events).toEqual(['sync started', 'other batch']);
    release();
    expect(await first).toEqual(jasmine.any(Error));
    await removal;
    expect(events).toEqual(['sync started', 'other batch', 'sync failed', 'deleted']);
    await expectAsync(withBrowserLock('batch-1', async () => 'available')).toBeResolvedTo(
      'available',
    );
  });
});
