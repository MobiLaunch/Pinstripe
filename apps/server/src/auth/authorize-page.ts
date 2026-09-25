/**
 * The browser page behind `GET /oauth/authorize`: sign in and approve an app.
 * Plain server-rendered HTML in the app's Aqua style; no scripts.
 */

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const SCOPE_LABELS: Record<string, string> = {
  read: "Read your account, timelines and notifications",
  write: "Post, favourite, boost and change your profile",
  follow: "Follow, unfollow, block and mute accounts",
  push: "Send you push notifications",
  profile: "See your basic profile",
};

function describeScope(scope: string): string {
  if (SCOPE_LABELS[scope]) return SCOPE_LABELS[scope];
  const [kind, what] = scope.split(":");
  return `${kind === "read" ? "Read" : "Change"} your ${what}`;
}

const STYLE = `
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  font-family:"Lucida Grande","Lucida Sans Unicode",Geneva,Verdana,sans-serif;color:#1a1a1a;
  background-color:#ececec;background-image:repeating-linear-gradient(180deg,#f4f4f4 0 2px,#e3e3e3 2px 4px)}
main{width:100%;max-width:380px}
h1{margin:0 0 4px;text-align:center;font-size:32px;color:#0e4fae}
.tag{margin:0 0 20px;text-align:center;font-size:13px;color:#555}
.card{background:#fff;border:1px solid #adadad;border-radius:9px;box-shadow:0 1px 3px rgba(0,0,0,.16);padding:18px}
.app{margin:0 0 12px;font-size:14px;line-height:1.45}
ul{margin:0 0 16px;padding-left:18px;font-size:13px;line-height:1.6;color:#333}
label{display:block;margin:0 0 5px 2px;font-size:12px;font-weight:bold;color:#333}
input[type=text],input[type=password]{display:block;width:100%;min-height:44px;margin:0 0 14px;padding:10px 12px;font:inherit;font-size:15px;
  border:1px solid #8c8c8c;border-top-color:#5e5e5e;border-radius:5px;box-shadow:inset 0 1px 3px rgba(0,0,0,.22)}
input:focus{outline:none;border-color:#3a7fd8;box-shadow:0 0 0 3px rgba(84,152,240,.65),inset 0 1px 3px rgba(0,0,0,.22)}
.row{display:flex;gap:10px}
button{flex:1;min-height:44px;border-radius:999px;font:inherit;font-weight:bold;font-size:15px;cursor:pointer}
.go{border:1px solid #13488f;color:#fff;text-shadow:0 -1px 0 rgba(0,0,0,.5);
  background:linear-gradient(180deg,#bfe0ff 0%,#74b1f3 14%,#2a74d6 50%,#175cbe 51%,#3585e6 85%,#79c0ff 100%)}
.no{border:1px solid #777;color:#1a1a1a;background:linear-gradient(180deg,#fff 0%,#f1f1f1 48%,#d9d9d9 52%,#e8e8e8 85%,#fbfbfb 100%)}
.error{margin:0 0 14px;padding:10px 12px;border-radius:5px;background:#fde8e6;border:1px solid #d9392f;color:#86190f;font-size:13px}
code{display:block;margin:10px 0 0;padding:12px;font-size:15px;word-break:break-all;background:#f4f4f4;border:1px solid #ccc;border-radius:5px}
`;

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escape(title)} · Pinstripe</title><style>${STYLE}</style></head>
<body><main><h1>Pinstripe</h1><p class="tag">Short videos for the fediverse.</p>${body}</main></body></html>`;
}

/** Everything the form has to send back so the POST can re-check it. */
export interface AuthorizeParams {
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
}

export function authorizePage(input: {
  appName: string;
  scopes: string[];
  params: AuthorizeParams;
  login?: string;
  error?: string;
}): string {
  const hidden = Object.entries(input.params)
    .map(([k, v]) => `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`)
    .join("");
  return layout(
    "Sign in",
    `<form class="card" method="post" action="/oauth/authorize">
${input.error ? `<p class="error" role="alert">${escape(input.error)}</p>` : ""}
<p class="app"><strong>${escape(input.appName)}</strong> wants to use your Pinstripe account to:</p>
<ul>${input.scopes.map((s) => `<li>${escape(describeScope(s))}</li>`).join("")}</ul>
${hidden}
<label for="login">Username or email</label>
<input type="text" id="login" name="login" autocomplete="username" autocapitalize="none" required value="${escape(input.login ?? "")}">
<label for="password">Password</label>
<input type="password" id="password" name="password" autocomplete="current-password" required>
<div class="row">
<button class="no" type="submit" name="decision" value="deny" formnovalidate>Deny</button>
<button class="go" type="submit" name="decision" value="allow">Authorize</button>
</div>
</form>`,
  );
}

export function errorPage(message: string): string {
  return layout("Error", `<div class="card"><p class="error" role="alert">${escape(message)}</p></div>`);
}

/** For `urn:ietf:wg:oauth:2.0:oob`: the user copies the code into the app. */
export function codePage(appName: string, code: string): string {
  return layout(
    "Authorization code",
    `<div class="card"><p class="app">Copy this code and paste it into <strong>${escape(appName)}</strong>:</p><code>${escape(code)}</code></div>`,
  );
}
