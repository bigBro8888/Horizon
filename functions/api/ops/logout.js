import { clearAdminSessionCookie, json } from "../../_lib/common.js";

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": clearAdminSessionCookie(),
    },
  });
}

export function onRequestGet() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
