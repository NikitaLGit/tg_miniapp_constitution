const express  = require('express');
const cors     = require('cors');
const crypto   = require('crypto');
const path     = require('path');
const Database = require('better-sqlite3');

const app       = express();
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const PORT      = process.env.PORT || 3002;
const DB_PATH   = process.env.DB_PATH || path.resolve(__dirname, 'constitution.db');

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const DEV_MODE = process.env.DEV_MODE === 'true' || !BOT_TOKEN;

function validateInitData(initData) {
  if (DEV_MODE) return { valid: true, user: { id: 'dev' } };

  const params = new URLSearchParams(initData);
  const hash   = params.get('hash');
  if (!hash) return { valid: false };
  params.delete('hash');

  const dataStr = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret   = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataStr).digest('hex');

  if (hash !== expected) return { valid: false };

  const userStr = params.get('user');
  return { valid: true, user: userStr ? JSON.parse(userStr) : { id: 'unknown' } };
}

function auth(req, res) {
  const result = validateInitData(req.headers['x-init-data'] || '');
  if (!result.valid) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  return result.user;
}

// ---------------------------------------------------------------------------
// Static frontend
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /search?q=...  →  up to 20 results
app.get('/search', (req, res) => {
  const user = auth(req, res);
  if (!user) return;

  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);

  let rows;
  if (/^\d+$/.test(q)) {
    rows = db.prepare(`
      SELECT id, article_number, chapter, title, substr(text, 1, 300) AS snippet
      FROM articles
      WHERE article_number = ?
      LIMIT 20
    `).all(parseInt(q, 10));
  } else {
    const terms = q.replace(/["^()\[\]]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return res.json([]);

    const ftsQuery = terms.map(w => w + '*').join(' ');

    // FTS5 highlights the full matched word; trim it to the typed prefix only
    function trimHighlight(snippet) {
      for (const term of terms) {
        const re = new RegExp(`<b>(${term})([^<]*)<\\/b>`, 'gi');
        snippet = snippet.replace(re, '<b>$1</b>$2');
      }
      return snippet;
    }

    try {
      rows = db.prepare(`
        SELECT a.id, a.article_number, a.chapter, a.title,
               snippet(articles_fts, 0, '<b>', '</b>', '...', 24) AS snippet
        FROM articles_fts
        JOIN articles a ON a.id = articles_fts.rowid
        WHERE articles_fts MATCH ?
        ORDER BY a.article_number ASC
        LIMIT 20
      `).all(ftsQuery).map(r => ({ ...r, snippet: trimHighlight(r.snippet) }));
    } catch {
      rows = db.prepare(`
        SELECT id, article_number, chapter, title, substr(text, 1, 300) AS snippet
        FROM articles
        WHERE text LIKE ?
        ORDER BY article_number ASC
        LIMIT 20
      `).all(`%${q.replace(/["^()\[\]]/g, '')}%`);
    }
  }

  res.json(rows);
});

// GET /random  →  random article id
app.get('/random', (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const row = db.prepare('SELECT id, article_number FROM articles ORDER BY RANDOM() LIMIT 1').get();
  res.json(row);
});

// GET /article/:id  →  full article
app.get('/article/:id', (req, res) => {
  const user = auth(req, res);
  if (!user) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  res.json(row);
});

// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Constitution backend: http://localhost:${PORT}`);
  if (!BOT_TOKEN) console.warn('BOT_TOKEN not set — auth disabled (dev mode)');
});
