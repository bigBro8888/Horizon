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
  if (
    path === "/api/ops/login" ||
    path.endsWith("/api/ops/login") ||
    path === "/api/ops/logout" ||
    path.endsWith("/api/ops/logout")
  ) {
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
