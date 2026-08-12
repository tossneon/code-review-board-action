'use strict';

const https = require('https');

// Verifies a Gumroad license key against a given product_id.
// Mirrors the verification pattern used by the PromptDeck extension
// (see promptdeck/storage.js) — product_id, not product_permalink, because
// Gumroad requires product_id for any product created after 2023-01-09.
// Fails closed: any error, non-200, or `success: false` response is treated
// as "not licensed" and the caller falls back to the free tier — never crash
// the whole review run just because Pro verification hiccuped.
function verifyGumroadLicense(productId, licenseKey) {
  return new Promise((resolve) => {
    if (!productId || !licenseKey) {
      resolve(false);
      return;
    }

    const body = new URLSearchParams({
      product_id: productId,
      license_key: licenseKey.trim(),
      increment_uses_count: 'false',
    }).toString();

    const req = https.request(
      {
        hostname: 'api.gumroad.com',
        path: '/v2/licenses/verify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 8000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(res.statusCode === 200 && parsed.success === true);
          } catch {
            resolve(false);
          }
        });
      },
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

module.exports = { verifyGumroadLicense };
