import assert from "node:assert/strict";

import {
  cleanPath,
  cleanReferrer,
  normalizeAds,
} from "../functions/_lib/common.js";
import { onRequest as adminMiddleware } from "../functions/api/admin/_middleware.js";
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

const unauthorized = await adminMiddleware({
  request: new Request("https://nowainews.com/api/admin/stats"),
  data: {},
  next: () => new Response("unexpected"),
});
assert.equal(unauthorized.status, 401);

let continued = false;
const authorized = await adminMiddleware({
  request: new Request("https://nowainews.com/api/admin/stats", {
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
