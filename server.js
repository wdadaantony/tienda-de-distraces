const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = path.join(ROOT, 'config.json');

const MAX_BODY = 40 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_IMAGES_PER_ITEM = 8;
const SESSION_TTL = 1000 * 60 * 60 * 12;

const DEFAULT_CATEGORIES = [
  ['adultos', 'Adultos'],
  ['dalinas-arlequines-payasos', 'Dalinas, Arlequines y Payasos'],
  ['halloween-sexy', 'Halloween Sexy'],
  ['ninos', 'Disfraces para Niños'],
  ['ositos-sorpresa', 'Ositos Sorpresa'],
  ['juegos-show', 'Juegos para Show'],
  ['botargas', 'Botargas'],
  ['dalinas-navidad', 'Dalinas de Navidad'],
  ['navidad', 'Disfraces de Navidad'],
  ['munecos-inflables', 'Muñecos Inflables'],
].map(([id, nombre], orden) => ({ id, nombre, orden }));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- config & storage ----------

function loadConfig() {
  const cfg = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {};
  let changed = !fs.existsSync(CONFIG_FILE);
  if (!cfg.adminUser) { cfg.adminUser = 'admin'; changed = true; }
  if (!cfg.adminPassword) { cfg.adminPassword = 'disfraces2026'; changed = true; }
  if (changed) fs.writeFileSync(CONFIG_FILE, JSON.stringify({ adminUser: cfg.adminUser, adminPassword: cfg.adminPassword }, null, 2));
  return cfg;
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const db = { categorias: DEFAULT_CATEGORIES, disfraces: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const config = loadConfig();
let db = loadDb();

let writeQueue = Promise.resolve();
function saveDb() {
  writeQueue = writeQueue.then(async () => {
    const tmp = DB_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(db, null, 2));
    await fsp.rename(tmp, DB_FILE);
  });
  return writeQueue;
}

// ---------- sessions ----------

const sessions = new Map();
const loginAttempts = new Map();

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)dp_session=([a-f0-9]{64})/);
  if (!match) return null;
  const s = sessions.get(match[1]);
  if (!s || s.expires < Date.now()) {
    sessions.delete(match[1]);
    return null;
  }
  return match[1];
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- helpers ----------

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('El envío es demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function price(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw httpError(400, 'Precio inválido');
  return Math.round(n * 100) / 100;
}

const UPLOAD_URL_RE = /^\/uploads\/[a-f0-9-]{36}\.(webp|jpg|png)$/;
const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;

async function resolveImages(list, allowedExisting) {
  if (!Array.isArray(list)) return [];
  if (list.length > MAX_IMAGES_PER_ITEM) throw httpError(400, `Máximo ${MAX_IMAGES_PER_ITEM} fotos por disfraz`);
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    if (UPLOAD_URL_RE.test(item)) {
      if (allowedExisting.includes(item)) out.push(item);
      continue;
    }
    const m = item.match(DATA_URL_RE);
    if (!m) throw httpError(400, 'Formato de imagen no permitido (usa JPG, PNG o WEBP)');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_IMAGE) throw httpError(400, 'Una de las imágenes pesa más de 10 MB');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const name = `${crypto.randomUUID()}.${ext}`;
    await fsp.writeFile(path.join(UPLOADS_DIR, name), buf);
    out.push(`/uploads/${name}`);
  }
  return out;
}

async function deleteImages(urls) {
  for (const url of urls) {
    if (!UPLOAD_URL_RE.test(url)) continue;
    await fsp.rm(path.join(UPLOADS_DIR, path.basename(url)), { force: true });
  }
}

function validateCostume(body) {
  const nombre = str(body.nombre, 120);
  if (!nombre) throw httpError(400, 'El nombre es obligatorio');
  const categoria = str(body.categoria, 80);
  if (!db.categorias.some((c) => c.id === categoria)) throw httpError(400, 'Categoría inválida');
  const modalidad = ['alquiler', 'venta', 'ambos'].includes(body.modalidad) ? body.modalidad : 'alquiler';
  return {
    nombre,
    categoria,
    modalidad,
    descripcion: str(body.descripcion, 2000),
    tallas: str(body.tallas, 200),
    precioAlquiler: modalidad === 'venta' ? null : price(body.precioAlquiler),
    precioVenta: modalidad === 'alquiler' ? null : price(body.precioVenta),
    disponible: body.disponible !== false,
    destacado: body.destacado === true,
  };
}

// ---------- API ----------

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (pathname === '/api/data' && method === 'GET') {
    return send(res, 200, db, { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/login' && method === 'POST') {
    const ip = req.socket.remoteAddress || '';
    const a = loginAttempts.get(ip) || { n: 0, until: 0 };
    if (a.until > Date.now()) throw httpError(429, 'Demasiados intentos. Espera unos minutos.');
    const body = await readBody(req);
    const userOk = safeEqual(String(body.usuario || '').trim().toLowerCase(), String(config.adminUser).toLowerCase());
    const passOk = safeEqual(body.password || '', config.adminPassword);
    if (!(userOk && passOk)) {
      a.n += 1;
      if (a.n >= 5) { a.n = 0; a.until = Date.now() + 5 * 60 * 1000; }
      loginAttempts.set(ip, a);
      throw httpError(401, 'Usuario o contraseña incorrectos');
    }
    loginAttempts.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { expires: Date.now() + SESSION_TTL });
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `dp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}`,
    });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const token = getSession(req);
    if (token) sessions.delete(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'dp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (pathname === '/api/me' && method === 'GET') {
    return send(res, 200, { admin: Boolean(getSession(req)) });
  }

  // everything below requires admin
  if (!getSession(req)) throw httpError(401, 'Sesión expirada. Vuelve a ingresar.');

  if (pathname === '/api/disfraces' && method === 'POST') {
    const body = await readBody(req);
    const data = validateCostume(body);
    const imagenes = await resolveImages(body.imagenes, []);
    const item = { id: crypto.randomUUID(), ...data, imagenes, creado: new Date().toISOString() };
    db.disfraces.unshift(item);
    await saveDb();
    return send(res, 201, item);
  }

  let m = pathname.match(/^\/api\/disfraces\/([a-f0-9-]{36})$/);
  if (m) {
    const idx = db.disfraces.findIndex((d) => d.id === m[1]);
    if (idx === -1) throw httpError(404, 'Disfraz no encontrado');
    const current = db.disfraces[idx];

    if (method === 'PUT') {
      const body = await readBody(req);
      const data = validateCostume(body);
      const imagenes = await resolveImages(body.imagenes, current.imagenes);
      await deleteImages(current.imagenes.filter((u) => !imagenes.includes(u)));
      db.disfraces[idx] = { ...current, ...data, imagenes, actualizado: new Date().toISOString() };
      await saveDb();
      return send(res, 200, db.disfraces[idx]);
    }

    if (method === 'PATCH') {
      const body = await readBody(req);
      if (typeof body.disponible === 'boolean') current.disponible = body.disponible;
      if (typeof body.destacado === 'boolean') current.destacado = body.destacado;
      await saveDb();
      return send(res, 200, current);
    }

    if (method === 'DELETE') {
      db.disfraces.splice(idx, 1);
      await deleteImages(current.imagenes);
      await saveDb();
      return send(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/categorias' && method === 'POST') {
    const body = await readBody(req);
    const nombre = str(body.nombre, 80);
    if (!nombre) throw httpError(400, 'El nombre es obligatorio');
    let id = slugify(nombre) || crypto.randomUUID().slice(0, 8);
    if (db.categorias.some((c) => c.id === id)) throw httpError(409, 'Ya existe una categoría con ese nombre');
    const cat = { id, nombre, orden: db.categorias.length };
    db.categorias.push(cat);
    await saveDb();
    return send(res, 201, cat);
  }

  if (pathname === '/api/categorias/orden' && method === 'PUT') {
    const body = await readBody(req);
    if (!Array.isArray(body.ids)) throw httpError(400, 'Orden inválido');
    body.ids.forEach((id, i) => {
      const c = db.categorias.find((x) => x.id === id);
      if (c) c.orden = i;
    });
    db.categorias.sort((a, b) => a.orden - b.orden);
    await saveDb();
    return send(res, 200, db.categorias);
  }

  m = pathname.match(/^\/api\/categorias\/([a-z0-9-]+)$/);
  if (m) {
    const cat = db.categorias.find((c) => c.id === m[1]);
    if (!cat) throw httpError(404, 'Categoría no encontrada');

    if (method === 'PUT') {
      const body = await readBody(req);
      const nombre = str(body.nombre, 80);
      if (!nombre) throw httpError(400, 'El nombre es obligatorio');
      cat.nombre = nombre;
      await saveDb();
      return send(res, 200, cat);
    }

    if (method === 'DELETE') {
      const used = db.disfraces.filter((d) => d.categoria === cat.id).length;
      if (used) throw httpError(409, `No se puede eliminar: tiene ${used} disfraz(es). Muévelos o elimínalos primero.`);
      db.categorias = db.categorias.filter((c) => c.id !== cat.id);
      await saveDb();
      return send(res, 200, { ok: true });
    }
  }

  throw httpError(404, 'Ruta no encontrada');
}

// ---------- static ----------

async function serveStatic(req, res, pathname) {
  let base = PUBLIC_DIR;
  let rel = pathname;
  if (pathname.startsWith('/uploads/')) {
    base = UPLOADS_DIR;
    rel = pathname.slice('/uploads'.length);
  } else if (pathname === '/' ) {
    rel = '/index.html';
  } else if (pathname === '/admin' || pathname === '/admin/') {
    rel = '/admin.html';
  }

  const filePath = path.normalize(path.join(base, decodeURIComponent(rel)));
  if (!filePath.startsWith(base + path.sep)) return send(res, 403, 'Prohibido');

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error();
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': base === UPLOADS_DIR ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    send(res, 404, 'No encontrado');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido');
    return await serveStatic(req, res, url.pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Error del servidor' : err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Disfraces Perú corriendo en  http://localhost:${PORT}`);
  console.log(`  Panel administrador en       http://localhost:${PORT}/admin\n`);
});
