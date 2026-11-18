// Finds listings for each part in Shopify's Global Catalog, which searches every
// Shopify store, and writes the best few per part to src/shop-links.json.
//
//   node scripts/find-shop-links.mjs
//
// Each part's `shop.query` in src/parts.js is the search; a listing is kept only
// when its title names the 992, matches `shop.match`, and matches neither
// `shop.exclude` nor the accessory words below.
// Run it again to refresh prices and availability.
import { writeFile } from 'node:fs/promises';
import { PARTS } from '../src/parts.js';

const ENDPOINT = 'https://catalog.shopify.com/api/ucp/mcp';
const PROFILE = 'https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json';
const PER_PART = 3;
// Listings that mention the part but are not the part itself.
const ACCESSORY = /\b(decals?|stickers?|ppf|film|sun ?shade|tear-?offs?|wiper|brackets?|covers?|hinge|scharnier|kit - |lettering|banner|winter set|paint)\b/i;

async function search(query, attempt = 0) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'search_catalog',
        arguments: {
          meta: { 'ucp-agent': { profile: PROFILE } },
          catalog: { query, filters: { ships_to: { country: 'US' }, available: true }, pagination: { limit: 20 } },
        },
      },
    }),
  });
  const body = await res.json();
  // The anonymous agent profile is rate limited, so back off and retry.
  if (/rate limit/i.test(body.error?.message ?? '') && attempt < 6) {
    await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt));
    return search(query, attempt + 1);
  }
  if (body.error) throw new Error(`${query}: ${body.error.message}`);
  return body.result.structuredContent.products ?? [];
}

const cache = new Map();
const links = {};
for (const [id, { shop }] of Object.entries(PARTS)) {
  if (!shop) continue;
  if (!cache.has(shop.query)) cache.set(shop.query, await search(shop.query));
  const seen = new Set();
  links[id] = [];
  for (const product of cache.get(shop.query)) {
    const v = product.variants?.[0];
    // Prices under $10 are "price on request" placeholders, not real prices.
    if (!v?.url || !v.price || v.price.amount < 1000) continue;
    const { title } = product;
    // Every listing must name the 992 generation, so it fits this car.
    if (!/992/.test(title) || !shop.match.test(title) || shop.exclude?.test(title) || ACCESSORY.test(title)) continue;
    // One listing per store, so each part shows a choice of sellers.
    const key = v.seller?.name ?? new URL(v.url).hostname;
    if (seen.has(key)) continue;
    seen.add(key);
    links[id].push({
      title: product.title.trim(),
      seller: v.seller?.name ?? new URL(v.url).hostname,
      price: v.price.amount / 100,
      currency: v.price.currency,
      url: v.url,
    });
    if (links[id].length === PER_PART) break;
  }
  console.log(`${id.padEnd(15)} ${links[id].length} listing(s)  ${links[id].map((l) => l.seller).join(', ')}`);
}

await writeFile(new URL('../src/shop-links.json', import.meta.url), `${JSON.stringify(links, null, 2)}\n`);
