import assert from "node:assert/strict";

import {
  ADMIN_SESSION_COOKIE,
  cleanPath,
  cleanReferrer,
  createAdminSessionToken,
  normalizeAds,
} from "../functions/_lib/common.js";
import { onRequest as opsMiddleware } from "../functions/api/ops/_middleware.js";
import { onRequestPost as login } from "../functions/api/ops/login.js";
import { onRequestPost as track } from "../functions/api/track.js";

assert.equal(cleanPath("/article/test?utm_source=x"), "/article/test");
assert.equal(cleanPath("article/test"), "/article/test");
assert.equal(
  cleanReferrer("https://www.google.com/search?q=ai", "https://nowainews.com"),
  "google.com"
);
assert.equal(
  cleanReferrer("https://nowainews.com/article/test", "https://nowainews.com"),
  "internal"
);

assert.deepEqual(
  normalizeAds({
    enabled: true,
    publisher_id: "ca-pub-4598371924010228",
    home_feed_slot: "1234567890",
    article_inline_slot: "",
    article_end_slot: "9876543210",
  }),
  {
    enabled: true,
    publisher_id: "ca-pub-4598371924010228",
    home_feed_slot: "1234567890",
    article_inline_slot: "",
    article_end_slot: "9876543210",
  }
);
assert.throws(
  () =>
    normalizeAds({
      enabled: true,
      publisher_id: "<script>alert(1)</script>",
    }),
  /publisher_id/
);

const unauthorized = await opsMiddleware({
  request: new Request("https://nowainews.com/api/ops/stats"),
  data: {},
  next: () => new Response("unexpected"),
});
assert.equal(unauthorized.status, 401);

const loginAllowed = await opsMiddleware({
  request: new Request("https://nowainews.com/api/ops/login", {
    method: "POST",
  }),
  data: {},
  next: () => new Response("login-ok"),
});
assert.equal(loginAllowed.status, 200);
assert.equal(await loginAllowed.text(), "login-ok");

const badLogin = await login({
  request: new Request("https://nowainews.com/api/ops/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "wrong" }),
  }),
  env: { ADMIN_PASSWORD: "dk++8429", ANALYTICS_SALT: "test-salt" },
});
assert.equal(badLogin.status, 401);

const goodLogin = await login({
  request: new Request("https://nowainews.com/api/ops/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "dk++8429" }),
  }),
  env: { ADMIN_PASSWORD: "dk++8429", ANALYTICS_SALT: "test-salt" },
});
assert.equal(goodLogin.status, 200);
assert.match(goodLogin.headers.get("set-cookie") || "", new RegExp(ADMIN_SESSION_COOKIE));

let continued = false;
const authorized = await opsMiddleware({
  request: new Request("https://nowainews.com/api/ops/stats", {
    headers: { "cf-access-authenticated-user-email": "Admin@example.com" },
  }),
  data: {},
  next: () => {
    continued = true;
    return new Response("ok");
  },
});
assert.equal(authorized.status, 200);
assert.equal(continued, true);

const sessionToken = await createAdminSessionToken(
  { ADMIN_PASSWORD: "dk++8429", ANALYTICS_SALT: "test-salt" },
  "password-admin"
);
const passwordContext = {
  request: new Request("https://nowainews.com/api/ops/stats", {
    headers: {
      cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}`,
    },
  }),
  env: { ADMIN_PASSWORD: "dk++8429", ANALYTICS_SALT: "test-salt" },
  data: {},
  next: () => new Response("ok"),
};
const passwordAuthorized = await opsMiddleware(passwordContext);
assert.equal(passwordAuthorized.status, 200);
assert.equal(passwordContext.data.adminEmail, "password-admin");
assert.equal(passwordContext.data.adminVia, "password");

const botResponse = await track({
  request: new Request("https://nowainews.com/api/track", {
    method: "POST",
    headers: { "user-agent": "Googlebot/2.1" },
  }),
  env: {},
});
assert.equal(botResponse.status, 200);
assert.equal((await botResponse.json()).tracked, false);

console.log("Pages Functions tests passed");
