// Genera la versión estática del sitio (carpeta dist/) para Netlify:
// una página HTML por categoría, subcategoría y disfraz, con SEO, más sitemap.xml y robots.txt.
const fs = require('fs');
const path = require('path');
const { SITE, GENS, catUrl, itemUrl, catTitle } = require('./public/js/seo.js');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const WA = '51991263000';
const BRAND = 'Disfraces Perú';
const TODAY = new Date().toISOString().slice(0, 10);

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8'));
const cats = [...db.categorias].sort((a, b) => a.orden - b.orden);
const items = db.disfraces;
const catById = Object.fromEntries(cats.map((c) => [c.id, c]));

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'data', 'db.json'), path.join(DIST, 'data', 'db.json'));
fs.cpSync(path.join(ROOT, 'uploads'), path.join(DIST, 'uploads'), { recursive: true });
fs.rmSync(path.join(DIST, 'admin.html'), { force: true });

const template = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (u) => (u.startsWith('http') ? u : SITE + u);
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const genOk = (d, g) => !g || !d.genero || d.genero === 'unisex' || d.genero === g;
const itemsOf = (catId, gen) => items.filter((d) => d.categoria === catId && genOk(d, gen));
const cover = (d) => (d.imagenes && d.imagenes[0]) || '/img/logo.jpg';
const sample = (arr, n) => arr.slice(0, n).map((d) => d.nombre).join(', ');

const business = {
  '@context': 'https://schema.org',
  '@type': 'ClothingStore',
  name: BRAND,
  url: SITE + '/',
  image: SITE + '/img/logo.jpg',
  logo: SITE + '/img/logo.jpg',
  telephone: '+51991263000',
  description: 'Alquiler y venta de disfraces para bebés, niños y adultos, botargas y accesorios en Miraflores, Lima.',
  address: { '@type': 'PostalAddress', streetAddress: 'Calle Shell 233', addressLocality: 'Miraflores', addressRegion: 'Lima', addressCountry: 'PE' },
  areaServed: 'Lima, Perú',
};
const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: BRAND,
  url: SITE + '/',
  potentialAction: { '@type': 'SearchAction', target: `${SITE}/?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
};

function breadcrumb(list) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + url })),
  };
}

function render({ url, title, desc, image, jsonld = [], body = '', noindex = false }) {
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  html = html.replace(/<link rel="canonical" id="canon" href="[^"]*">/, `<link rel="canonical" id="canon" href="${SITE}${url}">`);
  const head = [
    noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large">',
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${BRAND}">`,
    '<meta property="og:locale" content="es_PE">',
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${SITE}${url}">`,
    `<meta property="og:image" content="${esc(abs(image))}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#fb7701">',
    ...jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
  ].join('\n  ');
  html = html.replace('</head>', `  ${head}\n</head>`);
  html = html.replace('<script src="/js/seo.js">', `<noscript>${body}</noscript>\n  <script src="/js/seo.js">`);
  return html;
}

function write(url, html) {
  const dir = path.join(DIST, url);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

const links = (list) => `<ul>${list.map((d) => `<li><a href="${itemUrl(d)}">${esc(d.nombre)}</a></li>`).join('')}</ul>`;
const urls = [];

// ---- home ----
{
  const desc = `Alquiler y venta de disfraces para bebés, niños y adultos, botargas y accesorios en Miraflores, Lima. ${clip(sample(items.filter((d) => d.destacado), 3) || sample(items, 3), 80)}. WhatsApp 991 263 000.`;
  const home = render({
    url: '/',
    title: 'Disfraces Perú · Alquiler y venta de disfraces en Miraflores, Lima',
    desc,
    image: '/img/logo.jpg',
    jsonld: [business, website],
    body: `<h1>Disfraces Perú: alquiler y venta de disfraces en Miraflores, Lima</h1><p>Calle Shell #233, Miraflores. WhatsApp 991 263 000.</p><ul>${cats.map((c) => `<li><a href="${catUrl(c.id)}">${esc(catTitle(c.id, c.nombre))}</a></li>`).join('')}</ul>`,
  });
  fs.writeFileSync(path.join(DIST, 'index.html'), home);
  urls.push({ loc: '/', priority: '1.0', changefreq: 'daily', images: items.slice(0, 8).map((d) => cover(d)) });
}

// ---- categories and subcategories ----
for (const c of cats) {
  const variants = [undefined, 'varon', 'dama'];
  for (const gen of variants) {
    const list = itemsOf(c.id, gen);
    const url = catUrl(c.id, gen);
    const name = catTitle(c.id, c.nombre, gen);
    const title = `${name} en Miraflores, Lima · Alquiler y venta | ${BRAND}`;
    const desc = list.length
      ? `${name}: ${list.length} modelos para alquiler y venta en Miraflores, Lima. ${clip(sample(list, 4), 90)}. Consulta por WhatsApp 991 263 000.`
      : `${name} en ${BRAND}, Miraflores, Lima. Muy pronto más modelos: escríbenos por WhatsApp 991 263 000.`;
    const crumbs = [['Inicio', '/'], [c.nombre, catUrl(c.id)]];
    if (gen) crumbs.push([name, url]);
    const collection = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name,
      url: SITE + url,
      description: desc,
      isPartOf: { '@type': 'WebSite', name: BRAND, url: SITE + '/' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: list.length,
        itemListElement: list.slice(0, 40).map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + itemUrl(d), name: d.nombre, image: abs(cover(d)) })),
      },
    };
    const empty = list.length === 0;
    write(url, render({
      url, title, desc, image: list[0] ? cover(list[0]) : '/img/logo.jpg', noindex: empty,
      jsonld: [breadcrumb(crumbs), collection],
      body: `<h1>${esc(name)} en Miraflores, Lima</h1><p>${esc(desc)}</p>${links(list)}`,
    }));
    if (!empty) urls.push({ loc: url, priority: gen ? '0.7' : '0.9', changefreq: 'weekly', images: list.slice(0, 8).map((d) => cover(d)) });
  }
}

// ---- products ----
for (const d of items) {
  const c = catById[d.categoria];
  if (!c) continue;
  const url = itemUrl(d);
  const who = d.genero === 'varon' ? ' de varón' : d.genero === 'dama' ? ' de dama' : '';
  const title = `${d.nombre} · Disfraz${who} en alquiler y venta | ${BRAND}`;
  const base = d.descripcion || `${d.nombre}: disfraz${who} de la categoría ${c.nombre}.`;
  const desc = clip(`${base} Alquiler y venta en Miraflores, Lima. Consulta precio, talla y disponibilidad por WhatsApp 991 263 000.`, 300);
  const imgs = (d.imagenes || []).map(abs);
  const prices = [d.modalidad !== 'venta' ? d.precioAlquiler : null, d.modalidad !== 'alquiler' ? d.precioVenta : null].filter((x) => x != null);
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: d.nombre,
    sku: d.id.slice(0, 8),
    description: desc,
    category: c.nombre,
    image: imgs.length ? imgs : [SITE + '/img/logo.jpg'],
    brand: { '@type': 'Brand', name: BRAND },
  };
  if (prices.length) {
    product.offers = {
      '@type': 'Offer',
      url: SITE + url,
      priceCurrency: 'PEN',
      price: String(Math.min(...prices)),
      availability: d.disponible === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: BRAND },
    };
  }
  const crumbs = [['Inicio', '/'], [c.nombre, catUrl(c.id)], [d.nombre, url]];
  write(url, render({
    url, title, desc, image: cover(d),
    jsonld: [breadcrumb(crumbs), product],
    body: `<h1>${esc(d.nombre)}</h1>${imgs[0] ? `<img src="${esc(imgs[0])}" alt="${esc(d.nombre)}">` : ''}<p>${esc(desc)}</p><p><a href="https://wa.me/${WA}?text=${encodeURIComponent('Hola, me interesa: ' + d.nombre)}">Consultar por WhatsApp</a></p><p><a href="${catUrl(c.id)}">Ver más: ${esc(c.nombre)}</a></p>`,
  }));
  urls.push({ loc: url, priority: '0.6', changefreq: 'monthly', images: imgs.slice(0, 3).map((u) => u.replace(SITE, '')) });
}

// ---- sitemap, robots, headers ----
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `  <url>
    <loc>${SITE}${u.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
${(u.images || []).map((i) => `    <image:image><image:loc>${abs(i)}</image:loc></image:image>`).join('\n')}
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(path.join(DIST, '_headers'), `/uploads/*\n  Cache-Control: public, max-age=31536000, immutable\n/css/*\n  Cache-Control: public, max-age=3600\n/js/*\n  Cache-Control: public, max-age=3600\n`);

console.log(`dist listo: ${urls.length} URLs en el sitemap (${items.length} disfraces, ${cats.length} categorías).`);
