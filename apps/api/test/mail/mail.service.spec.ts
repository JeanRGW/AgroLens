import { ConfigService } from '@nestjs/config';
import { MailService } from '../../src/mail/mail.service';
import { MailTransportError } from '../../src/mail/transports';

function makeService(env: Record<string, unknown>): MailService {
  // Mirror the zod transforms from env.schema (booleans are 'true'/'false'
  // strings in env files; CORS_ORIGINS is a comma-separated list).
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(env)) {
    if ((key === 'MAIL_ENABLED' || key === 'SMTP_SECURE') && typeof value === 'string') {
      normalized[key] = value === 'true';
    } else if (key === 'CORS_ORIGINS' && typeof value === 'string') {
      normalized[key] = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      normalized[key] = value;
    }
  }
  normalized.MAIL_FROM = (normalized.MAIL_FROM === '' ? undefined : normalized.MAIL_FROM) ?? '';

  const configService = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in normalized ? normalized[key] : fallback,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in normalized) || normalized[key] === '' || normalized[key] == null) {
        throw new Error(`Missing config key: ${key}`);
      }
      return normalized[key];
    }),
  } as unknown as ConfigService;
  return new MailService(configService);
}

describe('MailService', () => {
  describe('capabilities', () => {
    it('is inert when mail is disabled', () => {
      const service = makeService({ MAIL_ENABLED: 'false' });

      expect(service.isEnabled()).toBe(false);
      expect(service.getTestMessages()).toEqual([]);
      expect(service.buildResetUrl('tok')).toBe('http://localhost:4200/reset-password?token=tok');
    });
  });

  describe('test transport', () => {
    const testEnv = {
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'test',
      MAIL_FROM: 'no-reply@example.com',
      MAIL_FROM_NAME: 'AgroLens',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
      MAIL_PASSWORD_RESET_TTL_MINUTES: '30',
    };

    it('captures sent messages and builds a reset URL from the first CORS origin', async () => {
      const service = makeService(testEnv);

      await service.sendPasswordResetEmail('user@example.com', 'reset-token-abc');

      const sent = service.getTestMessages();
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('user@example.com');
      expect(sent[0].subject).toContain('Redefinição de senha');
      expect(sent[0].text).toContain(
        'https://app.agrolens.rgw.app/reset-password?token=reset-token-abc',
      );
      expect(sent[0].html).toContain('/reset-password?token=reset-token-abc');
      expect(sent[0].html).toContain('30 minutos');
      expect(service.buildResetUrl('tok')).toBe(
        'https://app.agrolens.rgw.app/reset-password?token=tok',
      );
    });

    it('falls back to localhost when no CORS origin is configured', () => {
      const service = makeService({ ...testEnv, CORS_ORIGINS: '' });

      expect(service.buildResetUrl('tok')).toBe('http://localhost:4200/reset-password?token=tok');
    });
  });

  describe('resend transport', () => {
    const resendEnv = {
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: 're_123secret',
      MAIL_FROM: 'no-reply@example.com',
      MAIL_FROM_NAME: 'AgroLens',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
    };

    it('posts the message to the Resend API with bearer auth', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"id":"1"}',
      } as unknown as Response);
      const service = makeService(resendEnv);

      await service.sendPasswordResetEmail('user@example.com', 'tok');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer re_123secret',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"to":["user@example.com"]'),
        }),
      );
      fetchMock.mockRestore();
    });

    it('throws a MailTransportError on non-2xx responses', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => '{"message":"from rejected"}',
      } as unknown as Response);
      const service = makeService(resendEnv);

      await expect(service.sendPasswordResetEmail('user@example.com', 'tok')).rejects.toThrow(
        MailTransportError,
      );
      fetchMock.mockRestore();
    });
  });
});
