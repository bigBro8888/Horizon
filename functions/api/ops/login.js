import {
  adminSessionCookie,
  createAdminSessionToken,
  getAdminPassword,
  json,
} from "../../_lib/common.js";

export async function onRequestPost(context) {
  let payload = {};
  try {
    payload = await context.request.json();
  } catch (_) {
    return json({ ok: false, error: "请求格式无效" }, 400);
  }

  const password = String(payload.password || "");
  if (!password || password !== getAdminPassword(context.env)) {
    return json({ ok: false, error: "密码错误" }, 401);
  }

  const token = await createAdminSessionToken(context.env, "password-admin");
  return new Response(
    JSON.stringify({
      ok: true,
      email: "password-admin",
      via: "password",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie": adminSessionCookie(token),
      },
    }
  );
}

export function onRequestGet() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
