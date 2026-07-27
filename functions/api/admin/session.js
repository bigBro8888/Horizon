import { json } from "../../_lib/common.js";

export async function onRequestGet(context) {
  return json({
    ok: true,
    email: context.data.adminEmail,
    via: context.data.adminVia || "password",
  });
}
