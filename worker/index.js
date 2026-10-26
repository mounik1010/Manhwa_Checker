/**
 * Cloudflare Worker: Asura Scans CORS Proxy
 * 
 * Secure, lightweight proxy designed for Manhwa Checker.
 * - Allows GET requests with ?url=<encoded_asura_url>
 * - Strict allowlist: only https://asurascans.com and https://www.asurascans.com
 * - Edge caching for ~60 seconds via Cloudflare Cache API
 * - Browser-like User-Agent
 * - Configurable CORS via ALLOWED_ORIGIN env var (* default)
 */

export default {
  async fetch(request, env, ctx) {
    const corsOrigin = env.ALLOWED_ORIGIN || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
      'Access-Control-Max-Age': '86400',
    };

    // 1. Handle CORS preflight (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // 2. Reject non-GET methods
    if (request.method !== 'GET') {
      return jsonError('Method not allowed. Only GET is supported.', 405, corsHeaders);
    }

    const reqUrl = new URL(request.url);
    const targetUrlParam = reqUrl.searchParams.get('url');

    // 3. Validate query parameter
    if (!targetUrlParam) {
      return jsonError("Missing required 'url' query parameter. Example: /?url=https%3A%2F%2Fasurascans.com%2F", 400, corsHeaders);
    }

    let targetUrl;
    try {
      targetUrl = new URL(targetUrlParam);
    } catch {
      return jsonError("Invalid 'url' query parameter. Must be a valid URL.", 400, corsHeaders);
    }

    // 4. Strict allowlist: only https://asurascans.com and https://www.asurascans.com
    const allowedHosts = ['asurascans.com', 'www.asurascans.com'];
    if (targetUrl.protocol !== 'https:' || !allowedHosts.includes(targetUrl.hostname.toLowerCase())) {
      return jsonError(`Target URL not allowed. Only https://asurascans.com/... URLs are permitted. Received: ${targetUrl.hostname}`, 400, corsHeaders);
    }

    // 5. Cloudflare Cache API (polite to site, caches ~60 seconds)
    const cache = caches.default;
    // Cache key based on target URL
    const cacheKey = new Request(targetUrl.toString(), {
      method: 'GET',
    });

    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const responseHeaders = new Headers(cachedResponse.headers);
      responseHeaders.set('Access-Control-Allow-Origin', corsOrigin);
      responseHeaders.set('X-Proxy-Cache', 'HIT');
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: responseHeaders,
      });
    }

    // 6. Fetch from Asura Scans with browser-like headers
    try {
      const upstreamResponse = await fetch(targetUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
      });

      const bodyText = await upstreamResponse.text();

      const responseHeaders = new Headers({
        'Content-Type': upstreamResponse.headers.get('Content-Type') || 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': corsOrigin,
        'Cache-Control': 'public, max-age=60',
        'X-Proxy-Cache': 'MISS',
      });

      const responseToReturn = new Response(bodyText, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });

      // Cache successful responses for 60 seconds
      if (upstreamResponse.ok && ctx && ctx.waitUntil) {
        // Create a cacheable copy with Cache-Control header
        const responseToCache = new Response(bodyText, {
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
          headers: responseHeaders,
        });
        ctx.waitUntil(cache.put(cacheKey, responseToCache));
      }

      return responseToReturn;
    } catch (err) {
      return jsonError(`Failed to fetch upstream target: ${err.message || err}`, 502, corsHeaders);
    }
  },
};

function jsonError(message, status, corsHeaders) {
  return new Response(JSON.stringify({ error: message, status }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
