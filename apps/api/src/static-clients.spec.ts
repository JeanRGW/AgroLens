import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { staticClientOptions } from './static-clients';

describe('static client routing', () => {
  let app: INestApplication;
  let directory: string;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'agrolens-static-'));
    const web = join(directory, 'web');
    const mobile = join(directory, 'mobile');
    mkdirSync(web);
    mkdirSync(mobile);
    writeFileSync(join(web, 'index.html'), '<html>Angular</html>');
    writeFileSync(join(mobile, 'index.html'), '<html>Flutter</html>');
    writeFileSync(join(mobile, 'main.dart.js'), '/* Flutter bundle */');
    writeFileSync(join(mobile, 'sw.js'), '/* Flutter worker */');
    writeFileSync(join(mobile, 'sqlite3.wasm'), Buffer.from([0, 97, 115, 109]));
    @Module({ imports: [ServeStaticModule.forRoot(...staticClientOptions(web, mobile))] })
    class TestModule {}
    app = await NestFactory.create(TestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it.each(['/m/', '/m/queue'])('serves Flutter for %s, not the root fallback', async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .expect(200)
      .expect(/Flutter/);
  });

  it.each(['/m/main.dart.js', '/m/sw.js'])('serves the correct JavaScript for %s', async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .expect(200)
      .expect('Cache-Control', 'no-cache')
      .expect(/Flutter/);
  });

  it('serves wasm with the correct MIME type', async () => {
    await request(app.getHttpServer())
      .get('/m/sqlite3.wasm')
      .expect(200)
      .expect('Content-Type', 'application/wasm');
  });

  it('retains Angular deep-link routing', async () => {
    await request(app.getHttpServer())
      .get('/uploads')
      .expect(200)
      .expect(/Angular/);
  });

  it.each(['/api', '/api/missing', '/docs'])('does not turn %s into Angular HTML', async (path) => {
    await request(app.getHttpServer()).get(path).expect(404);
  });

  it('excludes /m from the root fallback even without a mobile build', () => {
    expect(staticClientOptions(join(directory, 'web'))[0].exclude).toEqual(
      expect.arrayContaining(['/m', '/m/{*path}']),
    );
  });

  it.each([
    { web: true, mobile: false },
    { web: false, mobile: true },
    { web: false, mobile: false },
  ])('registers clients independently: %j', async (builds) => {
    const options = staticClientOptions(
      join(directory, builds.web ? 'web' : 'missing-web'),
      join(directory, builds.mobile ? 'mobile' : 'missing-mobile'),
    );
    @Module({ imports: options.length ? [ServeStaticModule.forRoot(...options)] : [] })
    class TestModule {}
    const isolated = await NestFactory.create(TestModule, { logger: false });
    try {
      await isolated.init();
      await request(isolated.getHttpServer())
        .get('/uploads')
        .expect(builds.web ? 200 : 404);
      await request(isolated.getHttpServer())
        .get('/m/')
        .expect(builds.mobile ? 200 : 404);
      if (builds.mobile) {
        await request(isolated.getHttpServer())
          .get('/m/')
          .expect(/Flutter/);
        await request(isolated.getHttpServer())
          .get('/m/sw.js')
          .expect(200)
          .expect(/Flutter/);
        await request(isolated.getHttpServer())
          .get('/m/sqlite3.wasm')
          .expect(200)
          .expect('Content-Type', 'application/wasm');
      }
    } finally {
      await isolated.close();
    }
  });
});
