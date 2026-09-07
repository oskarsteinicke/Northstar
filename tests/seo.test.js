// The pages search engines actually see.
//
// None of this is exercised by the app, so nothing else would notice it
// breaking: a malformed JSON-LD block is silently ignored by Google, and a
// sitemap entry pointing at a page that disowns itself just quietly wastes
// crawl budget. These are static checks over the shipped HTML.
const fs = require('fs'), path = require('path');
const { APP, createReporter } = require('./harness');

const read = f => fs.readFileSync(path.join(APP, f), 'utf8');
const ORIGIN = 'https://get-arete.com';

// A sitemap URL is served extensionless by Cloudflare Pages; map it back.
function fileFor(loc) {
  let p = loc.replace(ORIGIN, '').replace(/^\//, '');
  if (!p) return 'landing.html';          // "/" renders the landing page
  return /\.html$/.test(p) ? p : p + '.html';
}

module.exports = function () {
  const r = createReporter('seo');

  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

  r.section('the sitemap points at pages that exist');
  {
    r.check('it lists something', locs.length > 0);
    for (const loc of locs) {
      const f = fileFor(loc);
      r.check(`${loc} -> ${f}`, fs.existsSync(path.join(APP, f)), '(404 in the sitemap)');
    }
  }

  // Listing a URL whose page names a different canonical asks Google to index
  // something the page itself says is not the real address.
  r.section('no listed page disowns its own URL');
  {
    for (const loc of locs) {
      const f = fileFor(loc);
      if (!fs.existsSync(path.join(APP, f))) continue;
      const m = read(f).match(/rel="canonical"\s+href="([^"]+)"/);
      if (!m) { r.check(`${f} has a canonical`, false, '(no canonical at all)'); continue; }
      const canon = m[1].replace(/\/$/, '');
      const want = loc.replace(/\/$/, '');
      r.check(`${f} canonical agrees with the sitemap`, canon === want,
        `(sitemap says ${want}, page says ${canon})`);
    }
  }

  r.section('every indexable page is describable');
  {
    for (const loc of locs) {
      const f = fileFor(loc);
      if (!fs.existsSync(path.join(APP, f))) continue;
      const src = read(f);
      const title = (src.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const desc = (src.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
      r.check(`${f} has a title`, title.length > 10 && title.length < 70, `(${title.length} chars)`);
      r.check(`${f} has a description`, desc.length > 50, `(${desc.length} chars)`);
    }
  }

  // Malformed structured data is not an error anywhere — it is simply ignored,
  // so it can rot indefinitely without a symptom.
  r.section('structured data parses and says the right things');
  {
    let found = 0;
    for (const loc of locs) {
      const f = fileFor(loc);
      if (!fs.existsSync(path.join(APP, f))) continue;
      const blocks = [...read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      r.check(`${f} carries structured data`, blocks.length > 0, '(no rich result possible)');
      for (const b of blocks) {
        found++;
        let d = null;
        try { d = JSON.parse(b[1]); } catch (e) {
          r.check(`${f} JSON-LD parses`, false, `(${e.message})`);
          continue;
        }
        r.check(`${f} JSON-LD parses`, true);
        r.check(`${f} declares a type`, !!d['@type']);
        if (d.offers) {
          r.check(`${f} states it is free`, String(d.offers.price) === '0',
            `(price ${d.offers.price})`);
        }
      }
    }
    r.check('some structured data exists at all', found > 0);
  }

  // Arete has no reviews. Marking up a rating would be a Google structured-data
  // violation and a straightforward lie to anyone reading the search result.
  r.section('no invented review data');
  {
    for (const loc of locs) {
      const f = fileFor(loc);
      if (!fs.existsSync(path.join(APP, f))) continue;
      const src = read(f);
      r.check(`${f} claims no rating`, !/aggregateRating|"ratingValue"|"reviewCount"/.test(src),
        '(fabricated reviews)');
    }
  }

  // Pages that are reachable but not meant to be found have to say so
  // themselves. robots.txt Disallow would be the wrong tool: it blocks the
  // crawl, so the directive is never read and the URL lingers in the index.
  r.section('pages outside the sitemap refuse indexing');
  {
    const listed = new Set(locs.map(fileFor));
    const PUBLIC_BY_DESIGN = new Set(['privacy.html', 'index.html']);
    const pages = fs.readdirSync(APP).filter(f => f.endsWith('.html'));
    for (const f of pages) {
      if (listed.has(f) || PUBLIC_BY_DESIGN.has(f)) continue;
      const m = read(f).match(/<meta name="robots" content="([^"]*)"/);
      r.check(`${f} is noindex`, !!m && /noindex/.test(m[1]),
        '(reachable and indexable but not a page you meant to rank)');
    }
  }

  r.section('robots does not block the site');
  {
    const robots = read('robots.txt');
    r.check('references the sitemap', robots.includes('sitemap.xml'));
    r.check('does not disallow everything', !/Disallow:\s*\/\s*$/m.test(robots),
      '(whole site blocked from search)');
  }

  return r.finish();
};
