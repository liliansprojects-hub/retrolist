// Resolves a Google Maps link (short maps.app.goo.gl links especially) to
// its real coordinates, running server-side on Netlify's own infrastructure.
//
// WHY THIS EXISTS: every purely client-side attempt at this (fetching
// through public CORS proxies from the browser) was failing consistently,
// because a browser's fetch() always carries a real browser User-Agent
// header that cannot be stripped or overridden from JavaScript — and Google
// serves a different response depending on that header. A request that
// looks like a browser gets served a JavaScript cookie-consent interstitial
// with no usable redirect information at all. A plain, header-less request
// gets a clean HTTP redirect straight to the real page. Running this one
// specific step server-side (where we DO control the outgoing headers) is
// the fix — not another proxy, an actual different request.
//
// Deployed automatically by Netlify's zero-config convention: any .js file
// in netlify/functions/ becomes a callable endpoint at
// /.netlify/functions/<filename>, no extra dashboard setup needed.

exports.handler = async (event) => {
  const url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url || !/^https:\/\/(maps\.app\.goo\.gl|goo\.gl|www\.google\.com|google\.com|maps\.google\.com)\//.test(url)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing or invalid url' }) };
  }

  try {
    // follow redirects manually, with no User-Agent header at all — this is
    // the one thing that can't be done from a browser's own fetch().
    let current = url;
    let finalUrl = url;
    for (let i = 0; i < 6; i++) {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'Accept': 'text/html' },
      });
      const location = res.headers.get('location');
      if (location && (res.status >= 300 && res.status < 400)) {
        current = new URL(location, current).toString();
        finalUrl = current;
        continue;
      }
      // no more redirects — this is the final page. try reading it for
      // embedded coordinates too, in case the URL itself doesn't carry them.
      finalUrl = current;
      let text = '';
      try { text = await res.text(); } catch { /* ignore */ }

      const fromUrl = extractFromUrl(finalUrl);
      if (fromUrl) return ok(fromUrl, finalUrl);

      const fromText = extractFromText(text);
      if (fromText) return ok(fromText, finalUrl);

      break;
    }

    // redirect chain ended without a response body we could read — last
    // check on whatever URL we landed on.
    const fromUrl = extractFromUrl(finalUrl);
    if (fromUrl) return ok(fromUrl, finalUrl);

    return { statusCode: 200, body: JSON.stringify({ found: false, finalUrl }) };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ found: false, error: String(err && err.message || err) }) };
  }
};

function ok(coords, finalUrl) {
  return { statusCode: 200, body: JSON.stringify({ found: true, lat: coords.lat, lng: coords.lng, finalUrl }) };
}

function extractFromUrl(u) {
  // !3d/!4d is the actual pin position; @lat,lng is only the map camera
  // position, which can be meaningfully different from the place itself —
  // so it's checked second, not first.
  let m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

function extractFromText(text) {
  if (!text) return null;
  let m = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = text.match(/"lat['"]?\s*:\s*(-?\d+\.\d+)[^}]*"lng['"]?\s*:\s*(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}
