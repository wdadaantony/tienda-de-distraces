(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DP_SEO = factory();
})(this, function () {
  const SITE = 'https://disfracesperu.net.pe';
  const GENS = { varon: 'Varón', dama: 'Dama' };
  const slug = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const catUrl = (id, gen) => (!id || id === 'todos' ? '/' : `/categoria/${encodeURIComponent(id)}/${GENS[gen] ? gen + '/' : ''}`);
  const itemUrl = (d) => `/disfraz/${slug(d.nombre)}-${String(d.id).slice(0, 8)}/`;

  const PHRASES = {
    bebes: { todos: 'Disfraces para Bebés', varon: 'Disfraces para Bebés Niño', dama: 'Disfraces para Bebés Niña' },
    ninos: { todos: 'Disfraces para Niños y Niñas', varon: 'Disfraces para Niños', dama: 'Disfraces para Niñas' },
    adultos: { todos: 'Disfraces para Adultos', varon: 'Disfraces para Hombres', dama: 'Disfraces para Mujeres' },
    accesorios: { todos: 'Accesorios para Disfraces', varon: 'Accesorios para Disfraces de Hombre', dama: 'Accesorios para Disfraces de Mujer' },
    botargas: { todos: 'Botargas', varon: 'Botargas para Hombre', dama: 'Botargas para Mujer' },
  };
  function catTitle(id, name, gen) {
    const g = GENS[gen] ? gen : 'todos';
    return PHRASES[id]?.[g] || (g === 'todos' ? `Disfraces ${name}` : `Disfraces ${name} · ${GENS[g]}`);
  }
  return { SITE, GENS, slug, catUrl, itemUrl, catTitle };
});
