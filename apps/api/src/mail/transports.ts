/**
 * Mail transports: Resend (HTTP API via fetch), SMTP (nodemailer), and an
 * in-memory test transport used by e2e tests (forbidden in production by the
 * env schema).
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export class MailTransportError extends Error {}

export interface SmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/**
 * Resend REST API client using Node's built-in fetch. No SDK dependency.
 */
export class ResendTransport implements MailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new MailTransportError(`Resend API error ${response.status}: ${detail.slice(0, 500)}`);
    }
  }
}

/**
 * SMTP transport via nodemailer. The nodemailer transport is created lazily
 * and reused across sends.
 */
export class SmtpTransport implements MailTransport {
  private transport: import('nodemailer').Transporter | null = null;

  constructor(private readonly config: SmtpTransportConfig) {}

  async send(message: MailMessage): Promise<void> {
    const transport = await this.getTransport();
    await transport.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  private async getTransport(): Promise<import('nodemailer').Transporter> {
    if (!this.transport) {
      const nodemailer = await import('nodemailer');
      const auth =
        this.config.user && this.config.pass
          ? { user: this.config.user, pass: this.config.pass }
          : undefined;
      this.transport = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth,
      });
    }
    return this.transport;
  }
}

/**
 * In-memory transport that captures messages for e2e tests.
 */
export class TestTransport implements MailTransport {
  private readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }

  getSent(): readonly MailMessage[] {
    return this.messages;
  }

  clear(): void {
    this.messages.length = 0;
  }
}
