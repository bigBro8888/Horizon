import { adminEmail, json } from "../../_lib/common.js";

export async function onRequest(context) {
  const email = adminEmail(context.request);
  if (!email) {
    return json(
      {
        ok: false,
        error: "需要通过 Cloudflare Access 登录",
      },
      401
    );
  }

  context.data.adminEmail = email;
  return context.next();
}
