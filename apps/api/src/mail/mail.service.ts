import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MailTransport,
  MailTransportError,
  ResendTransport,
  SmtpTransport,
  TestTransport,
  type MailMessage,
} from './transports';

/**
 * Sends application emails. Transport is selected at boot from MAIL_TRANSPORT
 * (resend | smtp | test). Mail is entirely optional: when MAIL_ENABLED=false
 * the service is inert and callers should surface 503 to clients.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly enabled: boolean;
  private readonly transport: MailTransport | null = null;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('MAIL_ENABLED', false);
    if (!this.enabled) {
      this.transport = null;
      return;
    }

    const transportKind = this.configService.get<'resend' | 'smtp' | 'test'>(
      'MAIL_TRANSPORT',
      'smtp',
    );
    const fromName = this.configService.get<string>('MAIL_FROM_NAME', 'AgroLens');
    const fromEmail = this.configService.get<string>('MAIL_FROM', '');
    const from = `${fromName} <${fromEmail}>`;

    switch (transportKind) {
      case 'resend':
        this.transport = new ResendTransport(
          this.configService.getOrThrow<string>('RESEND_API_KEY'),
          from,
        );
        break;
      case 'test':
        this.transport = new TestTransport();
        break;
      case 'smtp':
      default:
        this.transport = new SmtpTransport({
          host: this.configService.getOrThrow<string>('SMTP_HOST'),
          port: this.configService.get<number>('SMTP_PORT', 587),
          secure: this.configService.get<boolean>('SMTP_SECURE', false),
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
          from,
        });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Messages captured by the test transport (e2e only).
   */
  getTestMessages(): readonly MailMessage[] {
    if (this.transport instanceof TestTransport) {
      return this.transport.getSent();
    }
    return [];
  }

  /**
   * Clear captured test messages (e2e isolation).
   */
  clearTestMessages(): void {
    if (this.transport instanceof TestTransport) {
      this.transport.clear();
    }
  }

  /**
   * Build the browser-facing reset URL. The web app origin is the first
   * configured CORS origin — it is validated non-empty in production.
   */
  buildResetUrl(token: string): string {
    const origins = this.configService.get<string[]>('CORS_ORIGINS', []);
    const base = origins[0] || 'http://localhost:4200';
    const url = new URL('/reset-password', base);
    url.searchParams.set('token', token);
    return url.toString();
  }

  /**
   * Send the pt-BR password reset email. Throws MailTransportError on
   * delivery failure; callers must not surface it to clients (avoid leaking
   * account existence or availability details).
   */
  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    if (!this.enabled || !this.transport) {
      throw new MailTransportError('Mail is not enabled');
    }

    const ttlMinutes = this.configService.get<number>('MAIL_PASSWORD_RESET_TTL_MINUTES', 30);
    const resetUrl = this.buildResetUrl(token);
    const subject = 'AgroLens — Redefinição de senha';
    const text = [
      'Olá,',
      '',
      'Recebemos um pedido para redefinir a senha da sua conta AgroLens.',
      '',
      `Abra o link abaixo para criar uma nova senha (válido por ${ttlMinutes} minutos):`,
      resetUrl,
      '',
      'Se você não fez este pedido, ignore este e-mail. Sua senha atual continua válida.',
      '',
      'Atenciosamente,',
      'Equipe AgroLens',
    ].join('\n');
    const html = [
      '<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">',
      '  <h2 style="color: #166534;">Redefinição de senha — AgroLens</h2>',
      '  <p>Olá,</p>',
      '  <p>Recebemos um pedido para redefinir a senha da sua conta AgroLens.</p>',
      '  <p>',
      `    <a href="${resetUrl}" style="display: inline-block; padding: 12px 20px; background-color: #166534; color: #ffffff; text-decoration: none; border-radius: 8px;">Redefinir senha</a>`,
      '  </p>',
      `  <p style="font-size: 13px; color: #6b7280;">O link expira em ${ttlMinutes} minutos.</p>`,
      '  <p style="font-size: 13px; color: #6b7280;">Se você não fez este pedido, ignore este e-mail. Sua senha atual continua válida.</p>',
      '  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />',
      '  <p style="font-size: 12px; color: #9ca3af;">AgroLens — plataforma de imagens agrícolas</p>',
      '</div>',
    ].join('\n');

    this.logger.log(`Sending password reset email to ${to}`);
    await this.transport.send({ to, subject, text, html });
  }
}
