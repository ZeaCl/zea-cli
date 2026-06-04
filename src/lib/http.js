/**
 * ZEA Internal HTTP client — uses Node.js http/https module.
 * Unlike fetch (undici), this delegates DNS resolution to the OS
 * and respects /etc/hosts, Docker DNS, and .localhost domains.
 *
 * Usage: same as fetch but guaranteed to resolve local hostnames.
 *   import { zeaFetch } from '../lib/http.js';
 *   const resp = await zeaFetch(url, { method:'POST', body: data, headers: {...} });
 *   const json = await resp.json();
 */
import http from 'http';
import https from 'https';
import { URL } from 'url';

export function zeaFetch(url, options = {}) {
  if (process.env.MOCK_STITCH_API === 'true' && url.includes('stitch.googleapis.com/mcp')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          content: [
            {
              text: JSON.stringify({
                screens: [
                  { name: 'projects/123/screens/dashboard', title: 'Dashboard Sudlich' },
                  { name: 'projects/123/screens/funds_list', title: 'Lista de Fondos' },
                  { name: 'projects/123/screens/capital_call', title: 'Llamado de Capital' }
                ]
              })
            }
          ]
        }
      }),
      text: async () => ''
    });
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const port = parsed.port || (isHttps ? 443 : 80);

    const reqOptions = {
      hostname: parsed.hostname,
      port: port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 30000
    };

    const req = mod.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          json: async () => {
            try { return JSON.parse(data); } catch (e) { throw new Error(`Invalid JSON: ${data.slice(0,100)}`); }
          },
          text: async () => data
        });
      });
    });

    req.on('error', (e) => reject(new Error(`fetch failed: ${e.message}`)));
    req.setTimeout(options.timeout || 30000, () => { req.destroy(); reject(new Error('timeout')); });

    if (options.body) {
      if (typeof options.body === 'string') {
        req.write(options.body);
      } else if (Buffer.isBuffer(options.body)) {
        req.write(options.body);
      } else {
        req.write(JSON.stringify(options.body));
      }
    }
    req.end();
  });
}

export default zeaFetch;
