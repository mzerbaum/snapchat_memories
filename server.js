const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const fse = require('fs-extra');
const multer = require('multer');

const app = express();
const port = 3000;

const MEMORIES_ROOT = path.join(__dirname, 'memories');
const FAVORITES_FILE = path.join(__dirname, 'favorites.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(MEMORIES_ROOT));

const upload = multer({ storage: multer.memoryStorage() });

async function loadFavorites() {
  try {
    const data = await fs.readFile(FAVORITES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

async function saveFavorites(favorites) {
  await fse.outputFile(FAVORITES_FILE, JSON.stringify(favorites, null, 2), 'utf8');
}

async function collectMemories(dir, base = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(base, entry.name);

    if (entry.isDirectory()) {
      const subItems = await collectMemories(fullPath, relPath);
      items.push(...subItems);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.mp4'].includes(ext)) continue;

      const stat = await fs.stat(fullPath);
      const isVideo = ext === '.mp4';
      const urlPath = relPath.split(path.sep).join('/');

      items.push({
        id: encodeURIComponent(urlPath),
        path: `/media/${urlPath}`,
        name: entry.name,
        date: stat.mtimeMs,
        isVideo,
      });
    }
  }

  return items;
}

async function getMemoriesPaged(offset = 0, limit = 60) {
  const favorites = await loadFavorites();
  const all = await collectMemories(MEMORIES_ROOT);

  all.sort((a, b) => b.date - a.date);

  for (const item of all) {
    const relPath = decodeURIComponent(item.id);
    item.isFavorite = !!favorites[relPath];
  }

  const total = all.length;
  const slice = all.slice(offset, offset + limit);

  return { total, items: slice };
}

async function getFavoriteMemories() {
  const favorites = await loadFavorites();
  const all = await collectMemories(MEMORIES_ROOT);

  all.sort((a, b) => b.date - a.date);

  const favItems = all.filter((item) => {
    const relPath = decodeURIComponent(item.id);
    return !!favorites[relPath];
  });

  for (const item of favItems) {
    item.isFavorite = true;
  }

  return { total: favItems.length, items: favItems };
}

app.get('/api/memories', async (req, res) => {
  try {
    const offset = parseInt(req.query.offset || '0', 10) || 0;
    const limitRaw = parseInt(req.query.limit || '60', 10) || 60;
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    const data = await getMemoriesPaged(offset, limit);
    res.json(data);
  } catch (err) {
    console.error('Error reading memories', err);
    res.status(500).json({ error: 'Failed to read memories' });
  }
});

app.get('/api/memories/favorites', async (req, res) => {
  try {
    const data = await getFavoriteMemories();
    res.json(data);
  } catch (err) {
    console.error('Error reading favorite memories', err);
    res.status(500).json({ error: 'Failed to read favorite memories' });
  }
});

app.post('/api/memories/:id/favorite', async (req, res) => {
  try {
    const relPath = decodeURIComponent(req.params.id);
    const absPath = path.join(MEMORIES_ROOT, relPath);

    try {
      await fs.access(absPath);
    } catch {
      return res.status(404).json({ error: 'Memory not found' });
    }

    const favorites = await loadFavorites();
    const currently = !!favorites[relPath];
    const next = !currently;

    if (next) {
      favorites[relPath] = true;
    } else {
      delete favorites[relPath];
    }

    await saveFavorites(favorites);

    res.json({ id: encodeURIComponent(relPath), isFavorite: next });
  } catch (err) {
    console.error('Error toggling favorite', err);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

app.delete('/api/memories/:id', async (req, res) => {
  try {
    const relPath = decodeURIComponent(req.params.id);
    const absPath = path.join(MEMORIES_ROOT, relPath);

    try {
      await fs.unlink(absPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Memory not found' });
      }
      throw err;
    }

    const favorites = await loadFavorites();
    if (favorites[relPath]) {
      delete favorites[relPath];
      await saveFavorites(favorites);
    }

    res.status(204).end();
  } catch (err) {
    console.error('Error deleting memory', err);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

app.post('/api/import', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const importedDir = path.join(
      MEMORIES_ROOT,
      'imported-' + new Date().toISOString().replace(/[:.]/g, '-')
    );

    await fse.ensureDir(importedDir);

    for (const file of req.files) {
      const original = file.originalname;
      const ext = path.extname(original).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.mp4'].includes(ext)) continue;

      const safeName = original.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const target = path.join(importedDir, safeName);
      await fse.outputFile(target, file.buffer);
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Error importing files', err);
    res.status(500).json({ error: 'Failed to import files' });
  }
});

// Catch-all handler to serve the frontend for any non-API route
app.use((req, res, next) => {
  // Let API and static file requests pass through
  if (req.path.startsWith('/api') || req.path.startsWith('/media')) {
    return next();
  }

  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Snapchat Memories viewer listening at http://localhost:${port}`);
});
