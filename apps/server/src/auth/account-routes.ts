/**
 * Email and password (Pinstripe's own API; Mastodon does this on web pages):
 *
 *   GET  /api/v1/pinstripe/account               { email, confirmed }
 *   POST /api/v1/pinstripe/account/password      { current_password, password }   signs out other sessions
 *   POST /api/v1/pinstripe/account/email         { current_password, email }      sends a confirmation link
 *   POST /api/v1/pinstripe/account/confirmation  sends the confirmation link again
 *   POST /api/v1/pinstripe/password_reset        { email }   always 200, so it can't be used to find accounts
 *
 * and the pages the emailed links open:
 *
 *   GET  /auth/password/edit?token=   choose a new password (POST /auth/password)
 *   GET  /auth/confirmation?token=    confirm an address
 */
import { type Context, Hono } from "hono";
import type { Mailer } from "../mail/mailer.ts";
import { readParams } from "../http.ts";
import { messagePage, resetPasswordPage } from "./account-pages.ts";
import { errorPage } from "./authorize-page.ts";
import { type AuthEnv, requireUser } from "./middleware.ts";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./passwords.ts";
import { FailureLimiter } from "./rate-limit.ts";
import { type AuthStore, EmailTakenError } from "./store.ts";

const RESET_TTL_MS = 60 * 60 * 1000;
const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const htmlHeaders = { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" };

export interface AccountRoutesOptions {
  auth: AuthStore;
  mailer: Mailer;
  /** The public origin links in emails point at. */
  originOf: (c: Context) => string;
  /** How many emails one address can be sent per hour (resets and confirmations). */
  emailLimiter?: FailureLimiter;
}

function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password is too short (minimum is ${PASSWORD_MIN_LENGTH} characters)`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Password is too long (maximum is ${PASSWORD_MAX_LENGTH} characters)`;
  return null;
}

export function accountSecurityRoutes({ auth, mailer, originOf, emailLimiter = new FailureLimiter(5, 60 * 60 * 1000) }: AccountRoutesOptions) {
  const app = new Hono<AuthEnv>();

  /** Sends at most a few emails per address per hour; quietly drops the rest. */
  async function sendLimited(to: string, subject: string, text: string) {
    const key = to.toLowerCase();
    if (emailLimiter.isBlocked(key)) return;
    emailLimiter.recordFailure(key);
    try {
      await mailer.send({ to, subject, text });
    } catch (error) {
      console.error("Sending email failed", error);
    }
  }

  async function sendConfirmation(c: Context, accountId: string, email: string) {
    const token = await auth.createEmailToken("confirm", accountId, email, CONFIRM_TTL_MS);
    const link = new URL(`/auth/confirmation?token=${token}`, originOf(c)).href;
    await sendLimited(
      email,
      "Confirm your email for Pinstripe",
      `Tap to confirm this is your email address:\n\n${link}\n\nIf you didn't sign up for Pinstripe or change your email, you can ignore this.`,
    );
  }

  app.get("/api/v1/pinstripe/account", async (c) => {
    const result = requireUser(c, "read:accounts");
    if (!result.ok) return result.response;
    return c.json(await auth.getLogin(result.value.account.id));
  });

  app.post("/api/v1/pinstripe/account/password", async (c) => {
    const result = requireUser(c, "write:accounts");
    if (!result.ok) return result.response;
    const { account, token } = result.value;
    const p = await readParams(c);
    if (!(await auth.checkPassword(account.id, p.current_password ?? ""))) {
      return c.json({ error: "Your current password isn't right" }, 422);
    }
    const problem = passwordProblem(p.password ?? "");
    if (problem) return c.json({ error: problem }, 422);
    await auth.setPassword(account.id, p.password!, token.id);
    const login = await auth.getLogin(account.id);
    if (login) {
      await sendLimited(login.email, "Your Pinstripe password was changed", "Your password was just changed, and other devices were signed out. If this wasn't you, reset your password straight away from the sign-in screen.");
    }
    return c.json({});
  });

  app.post("/api/v1/pinstripe/account/email", async (c) => {
    const result = requireUser(c, "write:accounts");
    if (!result.ok) return result.response;
    const { account } = result.value;
    const p = await readParams(c);
    if (!(await auth.checkPassword(account.id, p.current_password ?? ""))) {
      return c.json({ error: "Your current password isn't right" }, 422);
    }
    const email = (p.email ?? "").trim();
    if (!EMAIL.test(email)) return c.json({ error: "That email address doesn't look right" }, 422);
    const before = await auth.getLogin(account.id);
    try {
      await auth.setEmail(account.id, email);
    } catch (error) {
      if (error instanceof EmailTakenError) return c.json({ error: "That email address is already in use" }, 422);
      throw error;
    }
    await sendConfirmation(c, account.id, email);
    if (before && before.email.toLowerCase() !== email.toLowerCase()) {
      await sendLimited(before.email, "Your Pinstripe email was changed", `Your account's email was changed to ${email}. If this wasn't you, reply to your server's admins.`);
    }
    return c.json(await auth.getLogin(account.id));
  });

  app.post("/api/v1/pinstripe/account/confirmation", async (c) => {
    const result = requireUser(c, "write:accounts");
    if (!result.ok) return result.response;
    const login = await auth.getLogin(result.value.account.id);
    if (login && !login.confirmed) await sendConfirmation(c, result.value.account.id, login.email);
    return c.json({});
  });

  app.post("/api/v1/pinstripe/password_reset", async (c) => {
    const email = ((await readParams(c)).email ?? "").trim();
    const login = EMAIL.test(email) ? await auth.findLoginByEmail(email) : null;
    if (login) {
      const token = await auth.createEmailToken("reset", login.accountId, login.email, RESET_TTL_MS);
      const link = new URL(`/auth/password/edit?token=${token}`, originOf(c)).href;
      await sendLimited(
        login.email,
        "Reset your Pinstripe password",
        `Someone asked to reset the password for your Pinstripe account. To choose a new one, open:\n\n${link}\n\nThe link works for an hour. If it wasn't you, ignore this; your password hasn't changed.`,
      );
    }
    // The same answer either way, so this can't tell anyone who has an account.
    return c.json({});
  });

  app.get("/auth/password/edit", async (c) => {
    const token = c.req.query("token") ?? "";
    if (!(await auth.peekEmailToken("reset", token))) {
      return c.html(errorPage("This link has expired or was already used. Ask for a new one from the sign-in screen."), 400, htmlHeaders);
    }
    return c.html(resetPasswordPage({ token }), 200, htmlHeaders);
  });

  app.post("/auth/password", async (c) => {
    const body = await c.req.parseBody();
    const token = String(body.token ?? "");
    const password = String(body.password ?? "");
    const problem = password !== String(body.confirm ?? "") ? "The two passwords don't match." : passwordProblem(password);
    if (problem) {
      if (!(await auth.peekEmailToken("reset", token))) return c.html(errorPage("This link has expired or was already used."), 400, htmlHeaders);
      return c.html(resetPasswordPage({ token, error: problem }), 422, htmlHeaders);
    }
    const used = await auth.useEmailToken("reset", token);
    if (!used) return c.html(errorPage("This link has expired or was already used. Ask for a new one from the sign-in screen."), 400, htmlHeaders);
    await auth.setPassword(used.accountId, password);
    // Reaching the inbox proves the address, too.
    await auth.confirmEmail(used.accountId, used.email);
    return c.html(messagePage("Password changed", "Your password has been changed. Open Pinstripe and sign in with it."), 200, htmlHeaders);
  });

  app.get("/auth/confirmation", async (c) => {
    const used = await auth.useEmailToken("confirm", c.req.query("token") ?? "");
    if (!used || !(await auth.confirmEmail(used.accountId, used.email))) {
      return c.html(errorPage("This confirmation link has expired or is for an address you've since changed."), 400, htmlHeaders);
    }
    return c.html(messagePage("Email confirmed", "Thanks, your email address is confirmed."), 200, htmlHeaders);
  });

  return { app, sendConfirmation };
}
