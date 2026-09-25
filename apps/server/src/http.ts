import type { Context } from "hono";

/** Mastodon clients send parameters as a query string, a form, or JSON; arrays become newline-joined. */
export async function readParams(c: Context): Promise<Record<string, string>> {
  const params: Record<string, string> = { ...c.req.query() };
  const type = c.req.header("content-type") ?? "";
  if (c.req.method === "GET") return params;
  if (type.includes("application/json")) {
    const body = await c.req.json().catch(() => ({}));
    for (const [k, v] of Object.entries(body ?? {})) {
      if (Array.isArray(v)) params[k] = v.join("\n");
      else if (v !== null && v !== undefined && typeof v !== "object") params[k] = String(v);
    }
  } else if (type.includes("form")) {
    const body = await c.req.parseBody({ all: true });
    for (const [k, v] of Object.entries(body)) {
      const key = k.replace(/\[\]$/, "");
      params[key] = Array.isArray(v) ? v.map(String).join("\n") : String(v);
    }
  }
  return params;
}

export const truthy = (v: string | undefined) => v === "true" || v === "1" || v === "on";

/** `?limit=` clamped to 1..max. */
export function readLimit(c: Context, fallback: number, max: number): number {
  const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
  return Number.isFinite(limit) && limit > 0 ? Math.min(limit, max) : fallback;
}

/**
 * Mastodon clients page with the Link header: `rel="next"` is older
 * (max_id = the last id shown), `rel="prev"` newer (min_id = the first).
 */
export function setLinkHeader(c: Context, ids: string[]) {
  if (!ids.length) return;
  const at = (key: string, id: string) => {
    const u = new URL(c.req.url);
    for (const k of ["max_id", "since_id", "min_id"]) u.searchParams.delete(k);
    u.searchParams.set(key, id);
    return u.href;
  };
  c.header("Link", `<${at("max_id", ids.at(-1)!)}>; rel="next", <${at("min_id", ids[0]!)}>; rel="prev"`);
}

export const notFound = (c: Context) => c.json({ error: "Record not found" }, 404);
