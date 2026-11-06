// Development loader for Home Assistant: register this file once as a dashboard
// resource (/local/ebusd-time-program-card-loader.js, JavaScript module) and the
// card is always loaded in its latest version, without bumping ?v= by hand.
// HA serves /local/ with a 31-day cache, so the card URL carries the file's ETag:
// unchanged file -> browser cache, new upload -> new ETag -> fresh download.
// Not needed once the card is installed through HACS (it adds ?hacstag=).
const url = "/local/ebusd-time-program-card.js";
let tag = String(Date.now());
try {
  const head = await fetch(url, { method: "HEAD", cache: "no-store" });
  tag = head.headers.get("etag") ?? tag;
} catch {
  // offline or HEAD blocked: load uncached
}
await import(`${url}?v=${encodeURIComponent(tag)}`);
