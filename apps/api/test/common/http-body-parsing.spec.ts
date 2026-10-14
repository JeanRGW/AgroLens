import { Body, Controller, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureJsonBodyParsing } from '../../src/common/http-body-parsing';

@Controller()
class ParsingTestController {
  @Post('auth/login') login(@Body() body: { email: string }) {
    return { email: body.email };
  }
  @Post('inference/jobs/:id/images/:imageId/review') review(@Body() body: { text: string }) {
    return { size: body.text.length };
  }
}
describe('scoped review request parser', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ParsingTestController],
    }).compile();
    app = module.createNestApplication();
    configureJsonBodyParsing(app, 'custom-api');
    app.setGlobalPrefix('custom-api');
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('still parses JSON on ordinary endpoints such as login', async () => {
    const response = await request(app.getHttpServer())
      .post('/custom-api/auth/login')
      .send({ email: 'user@test.local' })
      .expect(201);
    expect(response.body).toEqual({ email: 'user@test.local' });
  });
  it('allows larger review snapshots without increasing the ordinary body limit', async () => {
    const text = 'x'.repeat(150_000);
    const response = await request(app.getHttpServer())
      .post('/custom-api/inference/jobs/job/images/image/review')
      .send({ text })
      .expect(201);
    expect(response.body.size).toBe(text.length);
    await request(app.getHttpServer())
      .post('/custom-api/auth/login')
      .send({ email: text })
      .expect(413);
  });
  it('bounds review requests to one MiB', async () => {
    await request(app.getHttpServer())
      .post('/custom-api/inference/jobs/job/images/image/review')
      .send({ text: 'x'.repeat(1024 * 1024) })
      .expect(413);
  });
});
