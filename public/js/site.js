(() => {
  const WA = '51991263000';
  const PAGE = 24;
  const $ = (s) => document.querySelector(s);

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normChar = (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const norm = (s) => [...String(s ?? '')].map(normChar).join('');
  const amount = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const money = (n) => `S/ ${amount(n)}`;
  const hasRent = (d) => d.modalidad !== 'venta';
  const hasSale = (d) => d.modalidad !== 'alquiler';
  const minPrice = (d) => {
    const p = [hasRent(d) ? d.precioAlquiler : null, hasSale(d) ? d.precioVenta : null].filter((x) => x != null);
    return p.length ? Math.min(...p) : null;
  };
  const { SITE, GENS, catUrl, itemUrl, catTitle } = window.DP_SEO;
  const store = {
    get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  const ICON = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.3-4.5-9.3-9C1.3 8.3 3.3 4.8 6.8 4.8c2 0 3.5 1 4.2 2.3h2c.7-1.3 2.2-2.3 4.2-2.3 3.5 0 5.5 3.5 4.1 6.7-2 4.5-9.3 9-9.3 9Z"/></svg>',
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7V6a5 5 0 0 1 10 0v1h3l-1 14H5L4 7h3Zm2 0h6V6a3 3 0 0 0-6 0v1Zm2 4v2H9v2h2v2h2v-2h2v-2h-2v-2h-2Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 6 12l4.3 4.3-1.5 1.5-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>',
  };
  const CIRCLE_COLORS = ['#fb7701', '#e11d2e', '#7c3aed', '#0ea5e9', '#16a34a', '#db2777', '#f59e0b', '#0d9488', '#6366f1', '#dc2626'];

  const state = {
    cats: [], items: [], q: '', cat: 'todos', gen: 'todos', mode: 'todos', sort: 'recomendado', avail: false, fav: false,
    shown: PAGE, list: [],
    favs: new Set(store.get('dp_favs', [])),
    recent: store.get('dp_recent', []),
  };

  const catName = (id) => state.cats.find((c) => c.id === id)?.nombre || '';
  const catCount = (id) => state.items.filter((d) => d.categoria === id).length;

  // ---------- search ----------
  const tokensOf = (q) => norm(q).split(/\s+/).filter(Boolean);
  const stem = (t) => (t.length > 4 ? t.replace(/(es|s)$/, '') : t);
  const hayOf = (d) => norm(`${d.nombre} ${d.descripcion} ${catName(d.categoria)} ${d.tallas}`);
  function matches(d, toks) {
    const hay = hayOf(d);
    return toks.every((t) => hay.includes(t) || hay.includes(stem(t)));
  }
  function score(d, toks) {
    const name = norm(d.nombre);
    let s = 0;
    toks.forEach((t) => {
      if (name.startsWith(t)) s += 5;
      if (name.includes(t) || name.includes(stem(t))) s += 3;
      if (norm(catName(d.categoria)).includes(stem(t))) s += 1;
    });
    return s + (d.destacado ? 0.5 : 0);
  }
  function highlight(text, toks) {
    const n = [...text].map(normChar).join('');
    const marks = new Array(text.length).fill(false);
    toks.forEach((t) => {
      if (!t) return;
      let i = n.indexOf(t);
      while (i !== -1) { for (let j = i; j < i + t.length; j++) marks[j] = true; i = n.indexOf(t, i + t.length); }
    });
    let out = '', open = false;
    [...text].forEach((ch, i) => {
      if (marks[i] && !open) { out += '<mark>'; open = true; }
      if (!marks[i] && open) { out += '</mark>'; open = false; }
      out += esc(ch);
    });
    return out + (open ? '</mark>' : '');
  }

  // ---------- URL ----------
  function urlItemRaw() {
    const p = new URLSearchParams(location.search);
    const im = location.pathname.match(/^\/disfraz\/[^/]*-([a-f0-9]{8})\/?$/);
    return p.get('d') || (im ? 'pref:' + im[1] : null);
  }
  const resolveId = (raw) => (raw ? state.items.find((x) => x.id === raw || (raw.startsWith('pref:') && x.id.startsWith(raw.slice(5))))?.id : null);
  function readUrl() {
    const p = new URLSearchParams(location.search);
    const m = location.pathname.match(/^\/categoria\/([^/]+)(?:\/(varon|dama))?\/?$/);
    state.q = p.get('q') || '';
    state.cat = m ? decodeURIComponent(m[1]) : (p.get('cat') || 'todos');
    state.gen = m && m[2] ? m[2] : (GENS[p.get('gen')] ? p.get('gen') : 'todos');
    state.mode = ['alquiler', 'venta'].includes(p.get('modo')) ? p.get('modo') : 'todos';
    state.sort = ['nuevos', 'precio-asc', 'precio-desc'].includes(p.get('orden')) ? p.get('orden') : 'recomendado';
    state.avail = p.get('disp') === '1';
    state.fav = p.get('fav') === '1';
    return urlItemRaw();
  }
  function currentPath() {
    return !state.q && !state.fav && state.cat !== 'todos' ? catUrl(state.cat, state.gen) : '/';
  }
  function filterQuery() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (currentPath() === '/' && state.cat !== 'todos') {
      p.set('cat', state.cat);
      if (state.gen !== 'todos') p.set('gen', state.gen);
    }
    if (state.mode !== 'todos') p.set('modo', state.mode);
    if (state.sort !== 'recomendado') p.set('orden', state.sort);
    if (state.avail) p.set('disp', '1');
    if (state.fav) p.set('fav', '1');
    return p;
  }
  function writeUrl() {
    const qs = filterQuery().toString();
    history.replaceState(null, '', currentPath() + (qs ? `?${qs}` : ''));
  }
  function setSeo() {
    const onCat = currentPath() !== '/';
    document.title = onCat
      ? `${catTitle(state.cat, catName(state.cat), state.gen)} en Miraflores, Lima · Disfraces Perú`
      : 'Disfraces Perú · Alquiler y venta de disfraces en Miraflores';
    $('#canon').href = SITE + currentPath();
  }

  // ---------- list building ----------
  function buildList() {
    const toks = tokensOf(state.q);
    let list = state.items.filter((d) => {
      if (state.fav && !state.favs.has(d.id)) return false;
      if (state.cat !== 'todos' && d.categoria !== state.cat) return false;
      if (state.gen !== 'todos' && d.genero && d.genero !== 'unisex' && d.genero !== state.gen) return false;
      if (state.mode === 'alquiler' && !hasRent(d)) return false;
      if (state.mode === 'venta' && !hasSale(d)) return false;
      if (state.avail && d.disponible === false) return false;
      return toks.length ? matches(d, toks) : true;
    });
    const newest = (a, b) => String(b.creado).localeCompare(String(a.creado));
    if (state.sort === 'nuevos') list.sort(newest);
    else if (state.sort.startsWith('precio')) {
      const dir = state.sort === 'precio-asc' ? 1 : -1;
      const priceFor = (d) => (state.mode === 'venta' ? d.precioVenta : state.mode === 'alquiler' ? d.precioAlquiler : minPrice(d));
      list.sort((a, b) => {
        const pa = priceFor(a), pb = priceFor(b);
        if (pa == null) return 1;
        if (pb == null) return -1;
        return (pa - pb) * dir;
      });
    } else if (toks.length) list.sort((a, b) => score(b, toks) - score(a, toks) || newest(a, b));
    else list.sort((a, b) => (b.destacado === true) - (a.destacado === true) || newest(a, b));
    return list;
  }

  // ---------- cards ----------
  function priceHtml(d) {
    const rent = hasRent(d) && d.precioAlquiler != null;
    const sale = hasSale(d) && d.precioVenta != null;
    const preferSale = state.mode === 'venta' || (!rent && sale);
    if (!rent && !sale) return { main: '<div class="pc__price is-ask"><span class="amt">Consultar precio</span></div>', sub: '' };
    const p = preferSale ? d.precioVenta : d.precioAlquiler;
    const main = `<div class="pc__price"><span class="cur">S/</span><span class="amt">${amount(p)}</span><span class="per">${preferSale ? 'venta' : 'alquiler'}</span></div>`;
    const sub = !preferSale && sale ? `<div class="pc__sub">Venta ${money(d.precioVenta)}</div>`
      : preferSale && rent ? `<div class="pc__sub">Alquiler ${money(d.precioAlquiler)}</div>` : '';
    return { main, sub };
  }

  function cardHtml(d) {
    const img = d.imagenes?.[0];
    const fav = state.favs.has(d.id);
    const { main, sub } = priceHtml(d);
    return `
      <article class="pc" data-id="${esc(d.id)}">
        <div class="pc__img">
          <a href="${itemUrl(d)}" tabindex="-1" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="${esc(d.nombre)}" loading="lazy">` : '<div class="pc__noimg">Sin foto</div>'}</a>
          ${d.destacado ? '<span class="pc__badge">Destacado</span>' : ''}
          ${d.disponible === false ? '<span class="pc__out">Agotado por ahora</span>' : ''}
          <button type="button" class="pc__fav" aria-pressed="${fav}" aria-label="${fav ? 'Quitar de' : 'Agregar a'} favoritos">${ICON.heart}</button>
        </div>
        <div class="pc__body">
          <a class="pc__name" href="${itemUrl(d)}">${esc(d.nombre)}</a>
          <div class="pc__tags">
            ${hasRent(d) ? '<span class="tag tag--rent">Alquiler</span>' : ''}${hasSale(d) ? '<span class="tag tag--sale">Venta</span>' : ''}
          </div>
          ${sub}
          <div class="pc__row">${main}<span class="pc__cart" aria-hidden="true">${ICON.bag}</span></div>
        </div>
      </article>`;
  }

  function bindCards(container) {
    container.addEventListener('click', (e) => {
      const card = e.target.closest('.pc');
      if (!card) return;
      const favBtn = e.target.closest('.pc__fav');
      if (favBtn) { e.preventDefault(); toggleFav(card.dataset.id); return; }
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      openItem(card.dataset.id);
    });
  }

  // ---------- favorites ----------
  function toggleFav(id) {
    const on = !state.favs.has(id);
    on ? state.favs.add(id) : state.favs.delete(id);
    store.set('dp_favs', [...state.favs]);
    document.querySelectorAll(`.pc[data-id="${CSS.escape(id)}"] .pc__fav`).forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `${on ? 'Quitar de' : 'Agregar a'} favoritos`);
    });
    if (pdpItem?.id === id) syncPdpFav();
    renderFavCount();
    toast(on ? 'Agregado a favoritos' : 'Quitado de favoritos');
    if (state.fav) render({ keepScroll: true });
  }
  function renderFavCount() {
    const n = [...state.favs].filter((id) => state.items.some((d) => d.id === id)).length;
    $('#favCount').textContent = n;
    $('#favCount').hidden = n === 0;
  }

  // ---------- rendering ----------
  function renderNav() {
    const link = (id, name) => `<a href="${catUrl(id)}" data-cat="${esc(id)}" aria-current="${!state.fav && state.cat === id}">${esc(name)}</a>`;
    $('#catnav').innerHTML = link('todos', 'Todo') + state.cats.map((c) => link(c.id, c.nombre)).join('');
    $('#ftCats').innerHTML = state.cats.map((c) => `<a href="${catUrl(c.id)}" data-cat="${esc(c.id)}">${esc(c.nombre)}</a>`).join('');
    $('#catnav').querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function renderHome() {
    const ICONS = { bebes: '🍼', ninos: '🧒', adultos: '🎭', accesorios: '🎩', botargas: '🐻' };
    $('#circles').innerHTML = state.cats.map((c, i) => {
      const withImg = state.items.filter((d) => d.categoria === c.id && d.imagenes?.length);
      const feat = withImg.filter((d) => d.destacado);
      const pool = [...feat, ...withImg.filter((d) => !d.destacado)];
      const step = Math.max(1, Math.floor(pool.length / 3));
      const pics = [0, 1, 2].map((k) => pool[Math.min(pool.length - 1, k * step)]?.imagenes[0]).filter(Boolean);
      const n = state.items.filter((d) => d.categoria === c.id).length;
      const color = CIRCLE_COLORS[i % CIRCLE_COLORS.length];
      const art = pics.length
        ? `<span class="cat-card__pics cat-card__pics--${Math.min(pics.length, 3)}">${pics.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</span>`
        : `<span class="cat-card__empty" style="background:linear-gradient(135deg,${color},#0004),${color}"><span>${ICONS[c.id] || '✨'}</span></span>`;
      return `<a class="cat-card" href="${catUrl(c.id)}" data-cat="${esc(c.id)}" style="--cc:${color}">
        ${art}
        <span class="cat-card__body">
          <span class="cat-card__name">${esc(c.nombre)}</span>
          <span class="cat-card__count">${n ? n + ' disfraces' : 'Muy pronto'}</span>
          <span class="cat-card__go">Ver más →</span>
        </span></a>`;
    }).join('');

    const featured = state.items.filter((d) => d.destacado && d.imagenes?.length);
    $('#railSec').hidden = featured.length === 0;
    $('#rail').innerHTML = featured.slice(0, 16).map(cardHtml).join('');

    const withImg = state.items.filter((d) => d.imagenes?.length);
    const picks = [...featured, ...withImg.filter((d) => !d.destacado)].slice(0, 3);
    const art = $('#bannerArt');
    art.querySelectorAll('.banner__ph').forEach((n) => n.remove());
    art.classList.toggle('has-photos', picks.length === 3);
    if (picks.length === 3) {
      art.insertAdjacentHTML('afterbegin', picks.map((d) => `<div class="banner__ph"><img src="${esc(d.imagenes[0])}" alt=""></div>`).join(''));
    }
  }

  function renderHead(count) {
    const isHome = !state.q && state.cat === 'todos' && !state.fav;
    $('#home').hidden = !isHome;
    let title = 'Recomendados para ti';
    const crumbs = ['<a href="/" data-reset>Inicio</a>'];
    if (state.fav) { title = 'Mis favoritos'; crumbs.push('<span>Favoritos</span>'); }
    else if (state.q) {
      title = `Resultados para “${esc(state.q)}”`;
      if (state.cat !== 'todos') crumbs.push(`<a href="${catUrl(state.cat)}" data-cat="${esc(state.cat)}">${esc(catName(state.cat))}</a>`);
      crumbs.push('<span>Búsqueda</span>');
    } else if (state.cat !== 'todos') {
      title = esc(catTitle(state.cat, catName(state.cat), state.gen));
      if (state.gen !== 'todos') {
        crumbs.push(`<a href="${catUrl(state.cat)}" data-cat="${esc(state.cat)}">${esc(catName(state.cat))}</a>`, `<span>${esc(GENS[state.gen])}</span>`);
      } else crumbs.push(`<span>${esc(catName(state.cat))}</span>`);
    }
    $('#crumbs').innerHTML = isHome ? '' : crumbs.join('<span aria-hidden="true">›</span>');
    $('#crumbs').hidden = isHome;
    $('#resTitle').innerHTML = `${title}${isHome ? '' : ` <small>${count} ${count === 1 ? 'disfraz' : 'disfraces'}</small>`}`;
  }

  function renderSubcats() {
    const show = state.cat !== 'todos' && !state.q && !state.fav && catCount(state.cat) > 0;
    const box = $('#subcats');
    box.hidden = !show;
    if (!show) return;
    const items = state.items.filter((d) => d.categoria === state.cat);
    const n = (g) => items.filter((d) => !d.genero || d.genero === 'unisex' || d.genero === g).length;
    const chip = (gen, label, count) => `<a class="subcat" href="${catUrl(state.cat, gen)}" data-cat="${esc(state.cat)}" data-gen="${gen}" aria-current="${state.gen === gen}">${label}<small>${count}</small></a>`;
    box.innerHTML = chip('todos', 'Todos', items.length) + chip('varon', 'Disfraces de Varón', n('varon')) + chip('dama', 'Disfraces de Dama', n('dama'));
  }

  function renderFilters() {
    const priceSel = state.sort.startsWith('precio');
    $('#sorts').querySelectorAll('button').forEach((b) => {
      const on = b.dataset.sort === 'precio' ? priceSel : b.dataset.sort === state.sort;
      b.setAttribute('aria-selected', String(on));
    });
    $('#priceArrow').textContent = state.sort === 'precio-asc' ? '↑' : state.sort === 'precio-desc' ? '↓' : '↕';
    $('#modePills').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === state.mode)));
    $('#onlyAvail').checked = state.avail;
  }

  function renderFavCta(list) {
    $('#favCta').hidden = !state.fav || list.length === 0;
    if (!state.fav || !list.length) return;
    const lines = list.map((d) => `• ${d.nombre}`).join('\n');
    const msg = `Hola Disfraces Perú, me interesan estos disfraces:\n${lines}\n¿Me confirman precios y disponibilidad?`;
    $('#favWa').href = `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
  }

  function renderEmpty(list) {
    $('#empty').hidden = list.length > 0;
    if (list.length) return;
    if (state.fav) {
      $('#emptyTitle').textContent = 'Aún no tienes favoritos';
      $('#emptyText').textContent = 'Toca el corazón de cualquier disfraz para guardarlo aquí.';
    } else if (state.q) {
      $('#emptyTitle').textContent = `No encontramos “${state.q}”`;
      $('#emptyText').textContent = 'Revisa la ortografía o prueba con otra palabra. Tenemos más modelos en tienda.';
    } else if (state.cat !== 'todos' && catCount(state.cat) === 0) {
      $('#emptyTitle').textContent = 'Muy pronto más disfraces aquí';
      $('#emptyText').textContent = 'Estamos subiendo esta categoría. Escríbenos por WhatsApp y te enviamos los modelos disponibles.';
    } else {
      $('#emptyTitle').textContent = 'No hay disfraces con estos filtros';
      $('#emptyText').textContent = 'Prueba quitando algún filtro o escríbenos: tenemos más modelos en tienda.';
    }
  }

  function renderGrid(append = false) {
    const slice = state.list.slice(append ? state.shown - PAGE : 0, state.shown);
    const html = slice.map(cardHtml).join('');
    if (append) $('#grid').insertAdjacentHTML('beforeend', html);
    else $('#grid').innerHTML = html;
    const done = state.shown >= state.list.length;
    $('#endNote').hidden = !done || state.list.length < PAGE;
  }

  function render({ keepScroll = false } = {}) {
    state.list = buildList();
    state.shown = PAGE;
    renderNav();
    renderHead(state.list.length);
    renderSubcats();
    setSeo();
    renderFilters();
    renderFavCta(state.list);
    renderEmpty(state.list);
    renderGrid();
    if (!keepScroll && $('#home').hidden) {
      const top = $('#resHead').getBoundingClientRect().top + scrollY - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hd-h'), 10) - 8;
      if (scrollY > top || scrollY < top - 400) scrollTo({ top: Math.max(0, top) });
    }
  }

  function update(changes, opts) {
    Object.assign(state, changes);
    writeUrl();
    render(opts);
  }

  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && state.shown < state.list.length) {
      state.shown += PAGE;
      renderGrid(true);
    }
  }, { rootMargin: '600px' }).observe($('#sentinel'));

  // ---------- search box & suggestions ----------
  const q = $('#q');
  const sug = $('#suggest');
  let sgIndex = -1;

  function saveRecent(term) {
    const t = term.trim();
    if (!t) return;
    state.recent = [t, ...state.recent.filter((x) => norm(x) !== norm(t))].slice(0, 10);
    store.set('dp_recent', state.recent);
  }

  function renderSuggest() {
    const term = q.value.trim();
    const toks = tokensOf(term);
    let html = '';
    if (!toks.length) {
      if (state.recent.length) {
        html += `<div class="sg__sec"><div class="sg__head"><h3>Búsquedas recientes</h3><button type="button" data-clear-recent>${ICON.trash} Borrar</button></div>
          <div class="sg__chips">${state.recent.map((r) => `<button type="button" class="sg__chip" data-sg="q" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div></div>`;
      }
      const popular = [...state.cats].map((c) => ({ c, n: catCount(c.id) })).sort((a, b) => b.n - a.n).slice(0, 10);
      html += `<div class="sg__sec"><div class="sg__head"><h3>Categorías populares</h3></div>
        <div class="sg__chips">${popular.map(({ c }) => `<button type="button" class="sg__chip" data-sg="cat" data-v="${esc(c.id)}">${esc(c.nombre)}</button>`).join('')}</div></div>`;
    } else {
      const rows = [`<button type="button" class="sg__row" data-sg="q" data-v="${esc(term)}"><span class="sg__ico">${ICON.search}</span><span>Buscar “<b>${esc(term)}</b>”</span></button>`];
      state.cats.filter((c) => toks.every((t) => norm(c.nombre).includes(stem(t)))).slice(0, 3).forEach((c) => {
        rows.push(`<button type="button" class="sg__row" data-sg="cat" data-v="${esc(c.id)}"><span class="sg__ico">${ICON.grid}</span><span>${highlight(c.nombre, toks)}<small>Categoría · ${catCount(c.id)} disfraces</small></span></button>`);
      });
      state.items.filter((d) => matches(d, toks)).sort((a, b) => score(b, toks) - score(a, toks)).slice(0, 7).forEach((d) => {
        const img = d.imagenes?.[0];
        const p = minPrice(d);
        rows.push(`<button type="button" class="sg__row" data-sg="item" data-v="${esc(d.id)}">${img ? `<img src="${esc(img)}" alt="">` : '<span class="sg__ph"></span>'}
          <span>${highlight(d.nombre, toks)}<small>${esc(catName(d.categoria))}${p != null ? ` · desde ${money(p)}` : ''}</small></span></button>`);
      });
      html = rows.join('');
    }
    sug.innerHTML = html;
    sgIndex = -1;
  }

  function openSuggest() { renderSuggest(); sug.hidden = false; q.setAttribute('aria-expanded', 'true'); }
  function closeSuggest() { sug.hidden = true; q.setAttribute('aria-expanded', 'false'); sgIndex = -1; }

  function commitSearch(term) {
    const t = term.trim();
    q.value = t;
    $('#qClear').hidden = !t;
    saveRecent(t);
    closeSuggest();
    q.blur();
    update({ q: t, cat: 'todos', gen: 'todos', fav: false, sort: 'recomendado' });
  }

  function runSuggestion(el) {
    const { sg, v } = el.dataset;
    if (sg === 'q') commitSearch(v);
    if (sg === 'cat') { closeSuggest(); q.value = ''; $('#qClear').hidden = true; q.blur(); update({ cat: v, gen: 'todos', q: '', fav: false }); }
    if (sg === 'item') { saveRecent(q.value); closeSuggest(); q.blur(); openItem(v); }
  }

  q.addEventListener('focus', openSuggest);
  q.addEventListener('input', () => { $('#qClear').hidden = !q.value; openSuggest(); });
  q.addEventListener('keydown', (e) => {
    const opts = [...sug.querySelectorAll('[data-sg]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (sug.hidden) { openSuggest(); return; }
      const n = opts.length;
      if (!n) return;
      if (e.key === 'ArrowDown') sgIndex = sgIndex >= n - 1 ? -1 : sgIndex + 1;
      else sgIndex = sgIndex <= -1 ? n - 1 : sgIndex - 1;
      opts.forEach((o, i) => o.classList.toggle('is-active', i === sgIndex));
      opts[sgIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Escape') { closeSuggest(); }
  });
  $('#sbox').addEventListener('submit', (e) => {
    e.preventDefault();
    const active = sug.querySelectorAll('[data-sg]')[sgIndex];
    if (!sug.hidden && active) runSuggestion(active);
    else commitSearch(q.value);
  });
  sug.addEventListener('mousedown', (e) => e.preventDefault());
  sug.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear-recent]')) { state.recent = []; store.set('dp_recent', []); renderSuggest(); return; }
    const el = e.target.closest('[data-sg]');
    if (el) runSuggestion(el);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#sbox')) closeSuggest(); });
  $('#qClear').addEventListener('click', () => {
    q.value = '';
    $('#qClear').hidden = true;
    q.focus();
    if (state.q) update({ q: '' });
  });

  // ---------- filter bar & nav ----------
  $('#sorts').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    let sort = b.dataset.sort;
    if (sort === 'precio') sort = state.sort === 'precio-asc' ? 'precio-desc' : 'precio-asc';
    update({ sort });
  });
  $('#modePills').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) update({ mode: b.dataset.mode });
  });
  $('#onlyAvail').addEventListener('change', (e) => update({ avail: e.target.checked }));
  $('#resetAll').addEventListener('click', () => {
    q.value = '';
    $('#qClear').hidden = true;
    update({ q: '', cat: 'todos', gen: 'todos', mode: 'todos', avail: false, fav: false, sort: 'recomendado' });
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-cat], a[data-reset], #favLink');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    if (pdp.open) closePdp();
    q.value = '';
    $('#qClear').hidden = true;
    if (a.id === 'favLink') update({ fav: true, q: '', cat: 'todos', gen: 'todos' });
    else if (a.hasAttribute('data-reset')) { update({ q: '', cat: 'todos', gen: 'todos', fav: false, mode: 'todos', avail: false, sort: 'recomendado' }); scrollTo({ top: 0 }); }
    else update({ cat: a.dataset.cat, gen: a.dataset.gen || 'todos', q: '', fav: false });
  });

  bindCards($('#grid'));
  bindCards($('#rail'));
  bindCards($('#related'));

  // ---------- product page ----------
  const pdp = $('#pdp');
  let pdpItem = null;
  let pdpImg = 0;
  let pdpMode = 'alquiler';
  let pdpSize = '';
  let pdpDepth = 0;

  const sizesOf = (d) => {
    const parts = String(d.tallas || '').split(/[,;/·|]+/).map((s) => s.trim()).filter(Boolean);
    return parts.length && parts.every((p) => p.length <= 14) ? parts : [];
  };

  function syncPdpFav() {
    const on = state.favs.has(pdpItem.id);
    $('#pFav').setAttribute('aria-pressed', String(on));
    $('#pFav').setAttribute('aria-label', on ? 'Quitar de favoritos' : 'Agregar a favoritos');
  }

  function setPdpImg(i) {
    const imgs = pdpItem.imagenes || [];
    pdpImg = imgs.length ? (i + imgs.length) % imgs.length : 0;
    $('#pImg').src = imgs[pdpImg] || '/img/logo.jpg';
    $('#pImg').alt = pdpItem.nombre;
    $('#pCount').textContent = imgs.length > 1 ? `${pdpImg + 1}/${imgs.length}` : '';
    $('#pCount').hidden = imgs.length < 2;
    $('#pThumbs').querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-current', String(j === pdpImg)));
  }

  function renderPdpOptions() {
    const d = pdpItem;
    const boxes = [];
    if (hasRent(d)) boxes.push(`<button type="button" class="pprice__box${pdpMode === 'alquiler' ? ' is-sel' : ''}" data-mode="alquiler"><small>Alquiler</small><strong>${d.precioAlquiler != null ? `<span class="cur">S/</span>${amount(d.precioAlquiler)}` : 'Consultar'}</strong></button>`);
    if (hasSale(d)) boxes.push(`<button type="button" class="pprice__box pprice__box--sale${pdpMode === 'venta' ? ' is-sel' : ''}" data-mode="venta"><small>Venta</small><strong>${d.precioVenta != null ? `<span class="cur">S/</span>${amount(d.precioVenta)}` : 'Consultar'}</strong></button>`);
    $('#pPrice').innerHTML = boxes.join('');

    $('#pModeWrap').hidden = d.modalidad !== 'ambos';
    $('#pModeLbl').textContent = pdpMode === 'venta' ? 'Comprar' : 'Alquilar';
    $('#pModes').innerHTML = ['alquiler', 'venta'].map((m) =>
      `<button type="button" role="radio" data-mode="${m}" aria-checked="${pdpMode === m}">${m === 'venta' ? 'Comprar' : 'Alquilar'}</button>`).join('');

    const sizes = sizesOf(d);
    $('#pSizeWrap').hidden = sizes.length === 0;
    $('#pSizeLbl').textContent = pdpSize || 'elige una';
    $('#pSizes').innerHTML = sizes.map((s) => `<button type="button" role="radio" data-size="${esc(s)}" aria-checked="${pdpSize === s}">${esc(s)}</button>`).join('');

    const link = `${location.origin}/?d=${d.id}`;
    const price = pdpMode === 'venta' ? d.precioVenta : d.precioAlquiler;
    const lines = [
      'Hola Disfraces Perú, me interesa este disfraz:',
      `• ${d.nombre}`,
      `• ${pdpMode === 'venta' ? 'Para comprar' : 'Para alquilar'}${price != null ? ` (${money(price)})` : ''}`,
    ];
    if (sizes.length) lines.push(`• Talla: ${pdpSize || 'por confirmar'}`);
    else if (d.tallas) lines.push(`• Tallas: ${d.tallas}`);
    lines.push('¿Está disponible?', link);
    $('#pWa').href = `https://wa.me/${WA}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  function fillPdp(d) {
    pdpItem = d;
    pdpMode = hasRent(d) ? 'alquiler' : 'venta';
    pdpSize = '';
    const imgs = d.imagenes || [];
    $('#pThumbs').innerHTML = imgs.length > 1 ? imgs.map((u, i) => `<button type="button" data-i="${i}" aria-label="Foto ${i + 1}"><img src="${esc(u)}" alt=""></button>`).join('') : '';
    $('#pThumbs').hidden = imgs.length < 2;
    $('#pPrev').hidden = $('#pNext').hidden = imgs.length < 2;
    setPdpImg(0);

    $('#pCrumbs').innerHTML = [
      '<a href="/" data-reset>Inicio</a>',
      `<a href="${catUrl(d.categoria)}" data-cat="${esc(d.categoria)}">${esc(catName(d.categoria))}</a>`,
      `<span>${esc(d.nombre)}</span>`,
    ].join('<span aria-hidden="true">›</span>');
    $('#pTags').innerHTML = [
      d.destacado ? '<span class="tag tag--star">Destacado</span>' : '',
      `<a class="tag tag--cat" href="${catUrl(d.categoria)}" data-cat="${esc(d.categoria)}">${esc(catName(d.categoria))}</a>`,
      hasRent(d) ? '<span class="tag tag--rent">Alquiler</span>' : '',
      hasSale(d) ? '<span class="tag tag--sale">Venta</span>' : '',
    ].join('');
    $('#pTitle').textContent = d.nombre;
    const stock = $('#pStock');
    stock.textContent = d.disponible === false ? 'Agotado por ahora · pregúntanos por próximas fechas' : '● Disponible';
    stock.className = `pstock ${d.disponible === false ? 'is-out' : 'is-in'}`;
    const desc = [d.descripcion, d.tallas && !sizesOf(d).length ? `Tallas: ${d.tallas}` : ''].filter(Boolean).join('\n\n');
    $('#pDesc').textContent = desc;
    $('#pDescWrap').hidden = !desc;
    $('#pShare').textContent = 'Copiar enlace para compartir';
    syncPdpFav();
    renderPdpOptions();

    const same = state.items.filter((x) => x.id !== d.id && x.categoria === d.categoria);
    const others = state.items.filter((x) => x.id !== d.id && x.categoria !== d.categoria);
    const related = [...same, ...others].slice(0, 12);
    $('#relatedSec').hidden = related.length === 0;
    $('#related').innerHTML = related.map(cardHtml).join('');
    $('#pScroll').scrollTop = 0;
    document.title = `${d.nombre} · ${catName(d.categoria)} · Disfraces Perú`;
    $('#canon').href = SITE + itemUrl(d);
  }

  function openItem(id, { push = true } = {}) {
    const d = state.items.find((x) => x.id === id);
    if (!d) return;
    closeSuggest();
    fillPdp(d);
    if (push) {
      const p = filterQuery();
      pdpDepth += 1;
      history.pushState({ pdpDepth }, '', itemUrl(d));
    }
    if (!pdp.open) { pdp.showModal(); document.body.style.overflow = 'hidden'; }
  }

  function hidePdp() {
    if (pdp.open) pdp.close();
    document.body.style.overflow = '';
    pdpItem = null;
    setSeo();
  }

  let closing = false;
  function closePdp() {
    if (pdpDepth > 0) { closing = true; const n = pdpDepth; pdpDepth = 0; history.go(-n); }
    else writeUrl();
    hidePdp();
  }

  window.addEventListener('popstate', () => {
    if (closing) { closing = false; pdpDepth = 0; writeUrl(); hidePdp(); return; }
    const id = resolveId(urlItemRaw());
    pdpDepth = history.state?.pdpDepth || 0;
    if (id) openItem(id, { push: false });
    else hidePdp();
  });

  pdp.addEventListener('cancel', (e) => { e.preventDefault(); closePdp(); });
  $('#pClose').addEventListener('click', closePdp);
  $('#pBack').addEventListener('click', () => (pdpDepth > 0 ? history.back() : closePdp()));
  $('#pPrev').addEventListener('click', () => setPdpImg(pdpImg - 1));
  $('#pNext').addEventListener('click', () => setPdpImg(pdpImg + 1));
  $('#pThumbs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setPdpImg(Number(b.dataset.i)); });
  $('#pFav').addEventListener('click', () => toggleFav(pdpItem.id));
  $('#pPrice').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) { pdpMode = b.dataset.mode; renderPdpOptions(); } });
  $('#pModes').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) { pdpMode = b.dataset.mode; renderPdpOptions(); } });
  $('#pSizes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (!b) return;
    pdpSize = pdpSize === b.dataset.size ? '' : b.dataset.size;
    renderPdpOptions();
  });
  $('#pShare').addEventListener('click', async () => {
    const link = `${location.origin}${itemUrl(pdpItem)}`;
    try { await navigator.clipboard.writeText(link); $('#pShare').textContent = '¡Enlace copiado!'; }
    catch { prompt('Copia este enlace:', link); }
  });
  let touchX = null;
  $('#pImg').parentElement.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $('#pImg').parentElement.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) setPdpImg(pdpImg + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  // ---------- misc ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }

  const hd = $('#hd');
  new ResizeObserver(() => document.documentElement.style.setProperty('--hd-h', `${hd.offsetHeight}px`)).observe(hd);
  const toTop = $('#toTop');
  addEventListener('scroll', () => { toTop.hidden = scrollY < 1200; }, { passive: true });
  toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  $('#year').textContent = new Date().getFullYear();

  // ---------- boot ----------
  $('#grid').innerHTML = Array.from({ length: 12 }, () =>
    '<div class="pc skel"><div class="pc__img"></div><div class="pc__body"><i style="width:90%"></i><i style="width:60%"></i><i style="width:40%;height:18px"></i></div></div>').join('');
  const openId = readUrl();
  q.value = state.q;
  $('#qClear').hidden = !state.q;

  fetch('/api/data')
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((data) => {
      state.cats = [...data.categorias].sort((a, b) => a.orden - b.orden);
      state.items = data.disfraces;
      if (state.cat !== 'todos' && !state.cats.some((c) => c.id === state.cat)) state.cat = 'todos';
      const oid = resolveId(openId);
      if (oid && state.cat === 'todos' && !state.q && !state.fav) state.cat = state.items.find((x) => x.id === oid).categoria;
      renderHome();
      renderFavCount();
      render({ keepScroll: true });
      if (oid) openItem(oid, { push: false });
    })
    .catch(() => {
      $('#grid').innerHTML = '';
      $('#resTitle').textContent = 'No pudimos cargar el catálogo. Recarga la página o escríbenos por WhatsApp.';
    });
})();
