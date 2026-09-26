/**
 * Sending email: confirmation and password-reset links. SMTP in
 * production (`SMTP_URL`, any provider); in development the message is
 * printed to the console, links and all.
 */
import nodemailer from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  async send(mail: Mail) {
    console.log(`\n--- Email to ${mail.to}: ${mail.subject}\n${mail.text}\n---\n`);
  }
}

/** Keeps messages for tests to read. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
  }
  /** The first link in the newest message to `to`. */
  lastLink(to: string): string | null {
    const mail = [...this.sent].reverse().find((m) => m.to === to);
    return mail?.text.match(/https?:\/\/\S+/)?.[0] ?? null;
  }
}

export class SmtpMailer implements Mailer {
  readonly #transport: nodemailer.Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.#transport = nodemailer.createTransport(url);
  }

  async send(mail: Mail) {
    await this.#transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text });
  }
}
