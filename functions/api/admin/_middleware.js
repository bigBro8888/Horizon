import { json, resolveAdminIdentity } from "../../_lib/common.js";

function requestPath(request) {
  try {
    return new URL(request.url).pathname;
  } catch (_) {
    return "";
  }
}

export async function onRequest(context) {
  const path = requestPath(context.request);
  if (path === "/api/admin/login" || path.endsWith("/api/admin/login")) {
    return context.next();
  }

  const identity = await resolveAdminIdentity(context.request, context.env);
  if (!identity) {
    return json(
      {
        ok: false,
        error: "请先登录后台",
        login_required: true,
      },
      401
    );
  }

  context.data.adminEmail = identity.label;
  context.data.adminVia = identity.via;
  return context.next();
}
