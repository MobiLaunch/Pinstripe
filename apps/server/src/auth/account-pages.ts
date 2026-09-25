/** Browser pages for links in emails: choosing a new password, confirming an address. */
import { escape, layout } from "./authorize-page.ts";
import { PASSWORD_MIN_LENGTH } from "./passwords.ts";

export function resetPasswordPage(input: { token: string; error?: string }): string {
  return layout(
    "Choose a new password",
    `<form class="card" method="post" action="/auth/password">
${input.error ? `<p class="error" role="alert">${escape(input.error)}</p>` : ""}
<p class="app">Choose a new password for your Pinstripe account. You'll be signed out everywhere.</p>
<input type="hidden" name="token" value="${escape(input.token)}">
<label for="password">New password</label>
<input type="password" id="password" name="password" autocomplete="new-password" minlength="${PASSWORD_MIN_LENGTH}" required>
<p class="hint">At least ${PASSWORD_MIN_LENGTH} characters.</p>
<label for="confirm">Type it again</label>
<input type="password" id="confirm" name="confirm" autocomplete="new-password" minlength="${PASSWORD_MIN_LENGTH}" required>
<div class="row"><button class="go" type="submit">Change Password</button></div>
</form>`,
  );
}

export function messagePage(title: string, message: string): string {
  return layout(title, `<div class="card"><p class="ok" role="status">${escape(message)}</p></div>`);
}
