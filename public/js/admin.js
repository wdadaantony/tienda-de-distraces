(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const money = (n) => 'S/ ' + (Number.isInteger(n) ? n : n.toFixed(2));
  const MAX_PHOTOS = 8;

  const ICONS = {
    edit: '<svg viewBox="0 0 24 24"><path d="M3 17.2V21h3.8L17.8 10l-3.8-3.8L3 17.2ZM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8L20.7 7Z"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>',
  };

  const state = { cats: [], items: [], q: '', cat: 'todos', editing: null, photos: [], bulk: [] };

  // ---------- api ----------
  async function api(url, opts = {}) {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && url !== '/api/login') { showLogin(); }
    if (!res.ok) throw new Error(data.error || 'Ocurrió un error');
    return data;
  }

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast--error' : '');
    el.textContent = msg;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), 3200);
  }

  // ---------- images ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`No se pudo leer ${file.name}`)); };
      img.src = url;
    });
  }

  async function compress(file, max = 1400) {
    const img = await loadImage(file);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    let out = canvas.toDataURL('image/webp', 0.85);
    if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', 0.86);
    return out;
  }

  const imageFiles = (list) => [...list].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));

  function wireDrop(zone, input, onFiles) {
    input.addEventListener('change', () => { onFiles(imageFiles(input.files)); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-over'); }));
    zone.addEventListener('drop', (e) => onFiles(imageFiles(e.dataTransfer.files)));
  }

  const nameFromFile = (f) => f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^\w/, (c) => c.toUpperCase());

  // ---------- auth ----------
  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#usuario').focus();
  }

  async function showApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    await reload();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginError').textContent = '';
    try {
      await api('/api/login', { method: 'POST', body: { usuario: $('#usuario').value, password: $('#password').value } });
      $('#password').value = '';
      showApp();
    } catch (err) {
      $('#loginError').textContent = err.message;
    }
  });

  $('#logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  });

  // ---------- data ----------
  async function reload() {
    const data = await api('/api/data');
    state.cats = [...data.categorias].sort((a, b) => a.orden - b.orden);
    state.items = data.disfraces;
    renderAll();
  }

  const catName = (id) => state.cats.find((c) => c.id === id)?.nombre || '—';

  function catOptions(selected, withAll) {
    return (withAll ? `<option value="todos">Todas las categorías</option>` : '') +
      state.cats.map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('');
  }

  function renderAll() {
    $('#nItems').textContent = state.items.length;
    $('#nCats').textContent = state.cats.length;
    $('#acat').innerHTML = catOptions(state.cat, true);
    const bSel = $('#bCat').value;
    $('#bCat').innerHTML = catOptions(bSel);
    renderList();
    renderCats();
  }

  // ---------- tabs ----------
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  });

  // ---------- list ----------
  function renderList() {
    const q = norm(state.q);
    const list = state.items.filter((d) =>
      (state.cat === 'todos' || d.categoria === state.cat) && (!q || norm(d.nombre + ' ' + d.descripcion).includes(q)));
    $('#listEmpty').hidden = list.length > 0;
    $('#list').innerHTML = list.map((d) => {
      const tags = [
        d.genero === 'varon' ? '<span class="tag">Varón</span>' : d.genero === 'dama' ? '<span class="tag">Dama</span>' : '',
        d.modalidad !== 'venta' ? `<span class="tag tag--rent">Alquiler${d.precioAlquiler != null ? ' ' + money(d.precioAlquiler) : ''}</span>` : '',
        d.modalidad !== 'alquiler' ? `<span class="tag tag--sale">Venta${d.precioVenta != null ? ' ' + money(d.precioVenta) : ''}</span>` : '',
      ].join('');
      return `
        <article class="row" data-id="${esc(d.id)}">
          ${d.imagenes?.[0] ? `<img class="row__img" src="${esc(d.imagenes[0])}" alt="" loading="lazy">` : '<div class="row__img"></div>'}
          <div class="row__main">
            <div class="row__name">${esc(d.nombre)}</div>
            <div class="row__meta"><span>${esc(catName(d.categoria))}</span><span>${d.imagenes.length} foto${d.imagenes.length === 1 ? '' : 's'}</span>${tags}</div>
          </div>
          <div class="row__toggles">
            <label class="switch"><input type="checkbox" data-toggle="disponible"${d.disponible !== false ? ' checked' : ''}><span></span> Disponible</label>
            <label class="switch"><input type="checkbox" data-toggle="destacado"${d.destacado ? ' checked' : ''}><span></span> Destacado</label>
          </div>
          <div class="row__actions">
            <button type="button" class="icon-btn" data-act="edit" aria-label="Editar ${esc(d.nombre)}" title="Editar">${ICONS.edit}</button>
            <button type="button" class="icon-btn icon-btn--danger" data-act="del" aria-label="Eliminar ${esc(d.nombre)}" title="Eliminar">${ICONS.del}</button>
          </div>
        </article>`;
    }).join('');
  }

  $('#aq').addEventListener('input', (e) => { state.q = e.target.value; renderList(); });
  $('#acat').addEventListener('change', (e) => { state.cat = e.target.value; renderList(); });

  $('#list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('.row').dataset.id;
    const item = state.items.find((d) => d.id === id);
    if (btn.dataset.act === 'edit') openEditor(item);
    if (btn.dataset.act === 'del') {
      if (!confirm(`¿Eliminar "${item.nombre}"? Se borrarán también sus fotos.`)) return;
      try {
        await api(`/api/disfraces/${id}`, { method: 'DELETE' });
        state.items = state.items.filter((d) => d.id !== id);
        renderAll();
        toast('Disfraz eliminado');
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  $('#list').addEventListener('change', async (e) => {
    const input = e.target.closest('[data-toggle]');
    if (!input) return;
    const id = input.closest('.row').dataset.id;
    try {
      const updated = await api(`/api/disfraces/${id}`, { method: 'PATCH', body: { [input.dataset.toggle]: input.checked } });
      Object.assign(state.items.find((d) => d.id === id), updated);
    } catch (err) {
      input.checked = !input.checked;
      toast(err.message, 'error');
    }
  });

  // ---------- editor ----------
  const editor = $('#editor');
  const form = $('#edForm');

  function syncPriceFields() {
    const mode = form.modalidad.value;
    $('#fRent').hidden = mode === 'venta';
    $('#fSale').hidden = mode === 'alquiler';
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'modalidad') syncPriceFields(); });

  function openEditor(item) {
    state.editing = item || null;
    form.reset();
    $('#edError').textContent = '';
    $('#edTitle').textContent = item ? 'Editar disfraz' : 'Nuevo disfraz';
    $('#edCat').innerHTML = catOptions(item?.categoria ?? (state.cat !== 'todos' ? state.cat : state.cats[0]?.id));
    if (item) {
      form.nombre.value = item.nombre;
      form.modalidad.value = item.modalidad;
      form.genero.value = item.genero || 'unisex';
      form.precioAlquiler.value = item.precioAlquiler ?? '';
      form.precioVenta.value = item.precioVenta ?? '';
      form.tallas.value = item.tallas || '';
      form.descripcion.value = item.descripcion || '';
      form.disponible.checked = item.disponible !== false;
      form.destacado.checked = !!item.destacado;
    }
    state.photos = item ? [...item.imagenes] : [];
    syncPriceFields();
    renderPhotos();
    editor.showModal();
    form.nombre.focus();
  }

  function renderPhotos() {
    $('#edPhotos').innerHTML = state.photos.map((src, i) => `
      <div class="photo">
        <img src="${esc(src)}" alt="Foto ${i + 1}">
        ${i === 0 ? '<span class="photo__cover">Portada</span>' : ''}
        <div class="photo__btns">
          ${i > 0 ? `<button type="button" data-act="first" data-i="${i}" title="Usar como portada" aria-label="Usar como portada">★</button>` : ''}
          <button type="button" data-act="del" data-i="${i}" title="Quitar" aria-label="Quitar foto">×</button>
        </div>
      </div>`).join('');
    $('#edDrop').hidden = state.photos.length >= MAX_PHOTOS;
  }

  $('#edPhotos').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = Number(b.dataset.i);
    if (b.dataset.act === 'del') state.photos.splice(i, 1);
    if (b.dataset.act === 'first') state.photos.unshift(...state.photos.splice(i, 1));
    renderPhotos();
  });

  wireDrop($('#edDrop'), $('#edFiles'), async (files) => {
    const room = MAX_PHOTOS - state.photos.length;
    if (files.length > room) toast(`Solo se agregarán ${room} foto(s): máximo ${MAX_PHOTOS}`, 'error');
    for (const f of files.slice(0, room)) {
      try { state.photos.push(await compress(f)); renderPhotos(); }
      catch (err) { toast(err.message, 'error'); }
    }
  });

  editor.addEventListener('click', (e) => {
    if (e.target === editor || e.target.closest('[data-close]')) editor.close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#edError');
    err.textContent = '';
    if (!form.nombre.value.trim()) { err.textContent = 'Escribe el nombre del disfraz.'; form.nombre.focus(); return; }
    if (!form.categoria.value) { err.textContent = 'Primero crea una categoría.'; return; }
    const body = {
      nombre: form.nombre.value,
      categoria: form.categoria.value,
      modalidad: form.modalidad.value,
      genero: form.genero.value,
      precioAlquiler: form.precioAlquiler.value,
      precioVenta: form.precioVenta.value,
      tallas: form.tallas.value,
      descripcion: form.descripcion.value,
      disponible: form.disponible.checked,
      destacado: form.destacado.checked,
      imagenes: state.photos,
    };
    const save = $('#edSave');
    save.disabled = true;
    save.textContent = 'Guardando…';
    try {
      if (state.editing) {
        const updated = await api(`/api/disfraces/${state.editing.id}`, { method: 'PUT', body });
        state.items[state.items.findIndex((d) => d.id === updated.id)] = updated;
        toast('Cambios guardados');
      } else {
        const created = await api('/api/disfraces', { method: 'POST', body });
        state.items.unshift(created);
        toast('Disfraz creado');
      }
      editor.close();
      renderAll();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      save.disabled = false;
      save.textContent = 'Guardar';
    }
  });

  $('#newItem').addEventListener('click', () => {
    if (!state.cats.length) { toast('Primero crea una categoría', 'error'); return; }
    openEditor(null);
  });

  // ---------- bulk ----------
  function renderBulk() {
    $('#bList').innerHTML = state.bulk.map((b, i) => `
      <div class="bulk-item${b.status === 'done' ? ' is-done' : b.status === 'error' ? ' is-error' : ''}">
        <div class="bulk-item__img">
          <img src="${esc(b.src)}" alt="">
          ${b.status === 'done' ? '' : `<button type="button" data-i="${i}" aria-label="Quitar">×</button>`}
        </div>
        <input value="${esc(b.nombre)}" data-i="${i}" maxlength="120" placeholder="Escribe el nombre" aria-label="Nombre del disfraz"${b.status === 'done' ? ' disabled' : ''}>
      </div>`).join('');
    const pending = state.bulk.filter((b) => b.status !== 'done').length;
    $('#bFooter').hidden = state.bulk.length === 0;
    $('#bUpload').textContent = `Subir ${pending} ${pending === 1 ? 'disfraz' : 'disfraces'}`;
    $('#bUpload').disabled = pending === 0;
  }

  // Splits a screenshot of a photo grid (light tiles on a dark background) into one image per tile.
  async function splitGrid(file) {
    const img = await loadImage(file);
    const scale = Math.min(1, 1600 / img.naturalWidth);
    const W = Math.round(img.naturalWidth * scale);
    const H = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const isBg = (i) => {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      return (r < 130 && g > 140 && b > 200) || (b - r > 50 && r < 100 && b < 200 && g < 140 && b < 170) || (r > 200 && r - g > 40 && b > 170 && b - g > 10);
    };
    const runs = (frac, minLen, maxGap) => {
      const out = [];
      let s = -1;
      for (let i = 0; i <= frac.length; i++) {
        const on = i < frac.length && frac[i] > 0.5;
        if (on && s < 0) s = i;
        if (!on && s >= 0) {
          const last = out[out.length - 1];
          if (last && s - last[1] <= maxGap) last[1] = i; else out.push([s, i]);
          s = -1;
        }
      }
      return out.filter(([a, b]) => b - a >= minLen);
    };
    const colFrac = new Float32Array(W);
    for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) if (!isBg(y * W + x)) n++; colFrac[x] = n / H; }
    const tiles = [];
    for (const [x0, x1] of runs(colFrac, W * 0.15, W * 0.012)) {
      const rowFrac = new Float32Array(H);
      for (let y = 0; y < H; y++) { let n = 0; for (let x = x0; x < x1; x++) if (!isBg(y * W + x)) n++; rowFrac[y] = n / (x1 - x0); }
      let top = 0, bottom = H - 1;
      while (top < H && rowFrac[top] <= 0.5) top++;
      while (bottom > top && rowFrac[bottom] <= 0.5) bottom--;
      let mid = Math.round(H * 0.42);
      for (let y = mid; y < H * 0.58; y++) if (rowFrac[y] < rowFrac[mid]) mid = y;
      let g0 = mid, g1 = mid;
      while (g0 > top && rowFrac[g0 - 1] <= 0.5) g0--;
      while (g1 < bottom && rowFrac[g1 + 1] <= 0.5) g1++;
      if (rowFrac[mid] > 0.5) { g0 = mid; g1 = mid; }
      tiles.push({ x: x0, y: top, w: x1 - x0, h: g0 - top }, { x: x0, y: g1 + 1, w: x1 - x0, h: bottom - g1 });
    }
    if (tiles.length < 2) return null;
    tiles.sort((a, b) => (Math.abs(a.y - b.y) < H * 0.1 ? a.x - b.x : a.y - b.y));
    const inset = Math.max(3, Math.round(W * 0.004));
    return tiles.map((b) => {
      const c = document.createElement('canvas');
      c.width = Math.min(1400, b.w - inset * 2);
      c.height = Math.round(c.width * (b.h - inset * 2) / (b.w - inset * 2));
      c.getContext('2d').drawImage(canvas, b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.88);
    });
  }

  wireDrop($('#bDrop'), $('#bFiles'), async (files) => {
    for (const f of files) {
      try {
        const tiles = $('#bSplit').checked ? await splitGrid(f) : null;
        if ($('#bSplit').checked && !tiles) toast(`No pude separar ${f.name}; se subirá como una sola foto`, 'error');
        if (tiles) tiles.forEach((src) => state.bulk.push({ nombre: '', src, status: 'pending' }));
        else state.bulk.push({ nombre: nameFromFile(f), src: await compress(f), status: 'pending' });
        renderBulk();
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  $('#bList').addEventListener('input', (e) => {
    const i = e.target.dataset.i;
    if (i != null) state.bulk[i].nombre = e.target.value;
  });
  $('#bList').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.bulk.splice(Number(b.dataset.i), 1);
    renderBulk();
  });
  $('#bClear').addEventListener('click', () => { state.bulk = []; renderBulk(); $('#bProgress').hidden = true; });

  $('#bUpload').addEventListener('click', async () => {
    const cat = $('#bCat').value;
    if (!cat) { toast('Elige una categoría', 'error'); return; }
    const pending = state.bulk.filter((b) => b.status !== 'done');
    if (pending.some((b) => !b.nombre.trim())) { toast('Todas las fotos necesitan un nombre', 'error'); return; }
    const btn = $('#bUpload');
    btn.disabled = true;
    $('#bProgress').hidden = false;
    let ok = 0, fail = 0;
    for (const [n, b] of pending.entries()) {
      $('#bText').textContent = `Subiendo ${n + 1} de ${pending.length}…`;
      try {
        const created = await api('/api/disfraces', {
          method: 'POST',
          body: {
            nombre: b.nombre, categoria: cat, modalidad: $('#bMode').value, genero: $('#bGen').value,
            precioAlquiler: $('#bRent').value, precioVenta: $('#bSale').value,
            disponible: true, imagenes: [b.src],
          },
        });
        state.items.unshift(created);
        b.status = 'done';
        ok++;
      } catch (err) {
        b.status = 'error';
        fail++;
        if (/Sesión/.test(err.message)) break;
      }
      $('#bBar').style.width = `${((n + 1) / pending.length) * 100}%`;
      renderBulk();
    }
    $('#bText').textContent = fail ? `${ok} subidos · ${fail} con error (reintenta)` : `¡Listo! ${ok} disfraces subidos`;
    renderAll();
    toast(fail ? `${fail} no se pudieron subir` : `${ok} disfraces agregados al catálogo`, fail ? 'error' : undefined);
    state.bulk = state.bulk.filter((b) => b.status !== 'done');
    setTimeout(renderBulk, 1500);
  });

  // ---------- categories ----------
  function renderCats() {
    const counts = {};
    state.items.forEach((d) => { counts[d.categoria] = (counts[d.categoria] || 0) + 1; });
    $('#catList').innerHTML = state.cats.map((c, i) => `
      <li class="cat-item" data-id="${esc(c.id)}">
        <button type="button" class="icon-btn" data-act="up" aria-label="Subir"${i === 0 ? ' disabled' : ''}>${ICONS.up}</button>
        <button type="button" class="icon-btn" data-act="down" aria-label="Bajar"${i === state.cats.length - 1 ? ' disabled' : ''}>${ICONS.down}</button>
        <input value="${esc(c.nombre)}" maxlength="80" aria-label="Nombre de la categoría">
        <span class="cat-item__n">${counts[c.id] || 0} disfraces</span>
        <a class="icon-btn" href="/?cat=${encodeURIComponent(c.id)}" target="_blank" rel="noopener" title="Ver en la página" aria-label="Ver en la página"><svg viewBox="0 0 24 24"><path d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg></a>
        <button type="button" class="icon-btn icon-btn--danger" data-act="del" aria-label="Eliminar categoría">${ICONS.del}</button>
      </li>`).join('');
  }

  $('#catForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const cat = await api('/api/categorias', { method: 'POST', body: { nombre: $('#catName').value } });
      state.cats.push(cat);
      $('#catName').value = '';
      renderAll();
      toast('Categoría creada');
    } catch (err) { toast(err.message, 'error'); }
  });

  $('#catList').addEventListener('change', async (e) => {
    if (e.target.tagName !== 'INPUT') return;
    const id = e.target.closest('.cat-item').dataset.id;
    try {
      const cat = await api(`/api/categorias/${id}`, { method: 'PUT', body: { nombre: e.target.value } });
      Object.assign(state.cats.find((c) => c.id === id), cat);
      renderAll();
      toast('Categoría renombrada');
    } catch (err) { toast(err.message, 'error'); renderCats(); }
  });

  $('#catList').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const id = b.closest('.cat-item').dataset.id;
    const i = state.cats.findIndex((c) => c.id === id);
    try {
      if (b.dataset.act === 'del') {
        if (!confirm(`¿Eliminar la categoría "${state.cats[i].nombre}"?`)) return;
        await api(`/api/categorias/${id}`, { method: 'DELETE' });
        state.cats.splice(i, 1);
        toast('Categoría eliminada');
      } else {
        const j = b.dataset.act === 'up' ? i - 1 : i + 1;
        [state.cats[i], state.cats[j]] = [state.cats[j], state.cats[i]];
        state.cats = await api('/api/categorias/orden', { method: 'PUT', body: { ids: state.cats.map((c) => c.id) } });
      }
      renderAll();
    } catch (err) { toast(err.message, 'error'); }
  });

  // ---------- boot ----------
  api('/api/me').then((r) => (r.admin ? showApp() : showLogin())).catch(showLogin);
})();
