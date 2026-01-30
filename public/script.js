document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('memories-container');
  const loadingEl = document.getElementById('loading-indicator');

  const modal = document.getElementById('viewer-modal');
  const viewerMedia = document.getElementById('viewer-media');
  const viewerMediaInner = document.getElementById('viewer-media-inner');
  const prevBtn = document.getElementById('viewer-prev');
  const nextBtn = document.getElementById('viewer-next');
  const closeModalBtn = document.getElementById('close-modal');
  const favoriteBtn = document.getElementById('favorite-btn');
  const shareBtn = document.getElementById('share-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const themeToggle = document.getElementById('theme-toggle');
  const importBtn = document.getElementById('import-btn');
  const importInput = document.getElementById('import-input');
  const tabButtons = document.querySelectorAll('.tab-button');

  let memories = [];
  let total = null;
  let offset = 0;
  const pageSize = 60;
  let isLoading = false;
  let favoritesMode = false;

  let currentIndex = null;

  let lastMonthLabel = null;

  const mediaObserver = new IntersectionObserver(onMediaIntersect, {
    root: null,
    rootMargin: '200px',
    threshold: 0.1,
  });

  async function fetchMore() {
    if (favoritesMode) return;
    if (isLoading) return;
    if (total !== null && offset >= total) return;

    isLoading = true;
    loadingEl.textContent = 'Loading…';

    try {
      const res = await fetch(`/api/memories?offset=${offset}&limit=${pageSize}`);
      if (!res.ok) throw new Error('Failed to load memories');
      const data = await res.json();

      total = data.total;
      const startIndex = memories.length;
      memories = memories.concat(data.items);
      offset = memories.length;

      renderBatch(data.items, startIndex);

      if (offset >= total) {
        loadingEl.textContent = 'No more memories';
      } else {
        loadingEl.textContent = '';
      }
    } catch (err) {
      console.error(err);
      loadingEl.textContent = 'Error loading memories';
    } finally {
      isLoading = false;
    }
  }

  async function fetchFavorites() {
    isLoading = true;
    loadingEl.textContent = 'Loading favorites…';

    try {
      const res = await fetch('/api/memories/favorites');
      if (!res.ok) throw new Error('Failed to load favorites');
      const data = await res.json();

      memories = data.items;
      total = data.total;
      offset = memories.length;
      lastMonthLabel = null;
      grid.innerHTML = '';
      renderBatch(memories, 0);

      if (total === 0) {
        loadingEl.textContent = 'No favorites yet';
      } else {
        loadingEl.textContent = '';
      }
    } catch (err) {
      console.error(err);
      loadingEl.textContent = 'Error loading favorites';
    } finally {
      isLoading = false;
    }
  }

  function renderBatch(batch, startIndex) {
    batch.forEach((memory, i) => {
      const index = startIndex + i;
      const card = document.createElement('article');
      card.className = 'memory-card';
      card.dataset.index = String(index);
      card.dataset.id = memory.id;

      if (memory.isFavorite) {
        card.classList.add('is-favorite');
      }

      const monthLabel = getMonthLabel(memory);
      if (monthLabel !== lastMonthLabel) {
        const header = document.createElement('div');
        header.className = 'month-header';
        header.textContent = monthLabel;
        grid.appendChild(header);
        lastMonthLabel = monthLabel;
      }

      const thumb = document.createElement(memory.isVideo ? 'video' : 'img');
      thumb.className = 'memory-thumb';
      // Use IntersectionObserver for both images and videos; only set src when on screen
      thumb.dataset.src = memory.path;
      if (!memory.isVideo) {
        thumb.loading = 'lazy';
      } else {
        thumb.muted = true;
        thumb.playsInline = true;
        thumb.addEventListener('mouseenter', () => {
          thumb.play().catch(() => {});
        });
        thumb.addEventListener('mouseleave', () => {
          thumb.pause();
          try {
            thumb.currentTime = 0;
          } catch (_) {}
        });
      }

      const badge = document.createElement('div');
      badge.className = 'memory-badge';
      badge.textContent = memory.isVideo ? 'VIDEO' : 'PHOTO';

      const fav = document.createElement('div');
      fav.className = 'memory-favorite';
      fav.textContent = '★';

      card.appendChild(thumb);
      card.appendChild(badge);
      card.appendChild(fav);

      card.addEventListener('click', () => openViewer(index));

      grid.appendChild(card);

      mediaObserver.observe(thumb);
    });
  }

  function getMonthLabel(memory) {
    const d = new Date(memory.date);
    // Force English month names regardless of browser/system locale
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function onMediaIntersect(entries, observer) {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const src = el.dataset.src;
      if (!src || el.src) {
        observer.unobserve(el);
        return;
      }
      el.src = src;
      if (el.tagName === 'VIDEO') {
        // Load enough data to render the first frame
        el.preload = 'auto';
        el.muted = true;
        el.playsInline = true;
        const setFirstFrame = () => {
          try {
            el.currentTime = 0;
          } catch (_) {}
          el.removeEventListener('loadeddata', setFirstFrame);
          el.removeEventListener('loadedmetadata', setFirstFrame);
        };
        el.addEventListener('loadeddata', setFirstFrame);
        el.addEventListener('loadedmetadata', setFirstFrame);
      }
      observer.unobserve(el);
    });
  }

  function openViewer(index) {
    currentIndex = index;
    const memory = memories[index];
    if (!memory) return;

    viewerMediaInner.innerHTML = '';
    const el = document.createElement(memory.isVideo ? 'video' : 'img');
    el.src = memory.path;
    if (memory.isVideo) {
      el.controls = true;
      el.autoplay = true;
      el.playsInline = true;
    }
    viewerMediaInner.appendChild(el);

    updateFavoriteButton(memory);

    modal.classList.remove('hidden');
  }

  function closeViewer() {
    modal.classList.add('hidden');
    viewerMediaInner.innerHTML = '';
    currentIndex = null;
  }

  function updateFavoriteButton(memory) {
    favoriteBtn.textContent = memory.isFavorite ? '★ Favorited' : '★ Favorite';
  }

  async function toggleFavorite() {
    if (currentIndex == null) return;
    const memory = memories[currentIndex];
    try {
      const res = await fetch(`/api/memories/${memory.id}/favorite`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to favorite');
      const data = await res.json();
      memory.isFavorite = data.isFavorite;
      updateFavoriteButton(memory);

      const card = grid.querySelector(`.memory-card[data-id="${memory.id}"]`);
      if (card) {
        card.classList.toggle('is-favorite', memory.isFavorite);
      }

      if (favoritesMode && !memory.isFavorite) {
        if (card && card.parentElement) {
          card.parentElement.removeChild(card);
        }
        memories.splice(currentIndex, 1);

        if (memories.length === 0) {
          closeViewer();
          loadingEl.textContent = 'No favorites yet';
          return;
        }

        const nextIndex = Math.min(currentIndex, memories.length - 1);
        openViewer(nextIndex);
      }
    } catch (err) {
      console.error(err);
      alert('Could not update favorite');
    }
  }

  async function shareCurrent() {
    if (currentIndex == null) return;
    const memory = memories[currentIndex];
    const shareUrl = window.location.origin + memory.path;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Snapchat Memory',
          url: shareUrl,
        });
      } catch (err) {
        if (err && err.name !== 'AbortError') {
          console.error(err);
          alert('Could not share');
        }
      }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copied to clipboard');
      } catch (err) {
        console.error(err);
        alert('Could not copy link');
      }
    } else {
      window.prompt('Copy this link:', shareUrl);
    }
  }

  async function deleteCurrent() {
    if (currentIndex == null) return;
    const memory = memories[currentIndex];
    const confirmDelete = window.confirm('Delete this memory from disk? This cannot be undone.');
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/memories/${memory.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete');

      const card = grid.querySelector(`.memory-card[data-id="${memory.id}"]`);
      if (card && card.parentElement) {
        card.parentElement.removeChild(card);
      }

      memories.splice(currentIndex, 1);

      if (memories.length === 0) {
        closeViewer();
        return;
      }

      const nextIndex = Math.min(currentIndex, memories.length - 1);
      openViewer(nextIndex);
    } catch (err) {
      console.error(err);
      alert('Could not delete memory');
    }
  }

  function onScroll() {
    if (favoritesMode) return;
    const scrollPos = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 800;
    if (scrollPos >= threshold) {
      fetchMore();
    }
  }

  closeModalBtn.addEventListener('click', closeViewer);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeViewer();
  });

  window.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;

    if (e.key === 'Escape') {
      closeViewer();
    } else if (e.key === 'ArrowRight') {
      if (currentIndex != null && currentIndex < memories.length - 1) {
        openViewer(currentIndex + 1);
      }
    } else if (e.key === 'ArrowLeft') {
      if (currentIndex != null && currentIndex > 0) {
        openViewer(currentIndex - 1);
      }
    }
  });

  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentIndex != null && currentIndex > 0) {
        openViewer(currentIndex - 1);
      }
    });

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentIndex != null && currentIndex < memories.length - 1) {
        openViewer(currentIndex + 1);
      }
    });
  }

  favoriteBtn.addEventListener('click', toggleFavorite);
  shareBtn.addEventListener('click', shareCurrent);
  deleteBtn.addEventListener('click', deleteCurrent);

  window.addEventListener('scroll', onScroll);

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    themeToggle.textContent = theme === 'light' ? '☾' : '☀︎';
  }

  const savedTheme = localStorage.getItem('theme');
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(savedTheme || (prefersLight ? 'light' : 'dark'));

  themeToggle.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

   if (importBtn && importInput) {
    importBtn.addEventListener('click', () => {
      importInput.click();
    });

    importInput.addEventListener('change', async () => {
      if (!importInput.files || importInput.files.length === 0) return;

      const formData = new FormData();
      Array.from(importInput.files).forEach((file) => {
        formData.append('files', file, file.webkitRelativePath || file.name);
      });

      loadingEl.textContent = 'Importing…';

      try {
        const res = await fetch('/api/import', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error('Import failed');

        memories = [];
        total = null;
        offset = 0;
        lastMonthLabel = null;
        grid.innerHTML = '';
        favoritesMode = false;
        tabButtons.forEach((b) => {
          b.classList.toggle('active', b.dataset.tab === 'all');
        });
        await fetchMore();
      } catch (err) {
        console.error(err);
        alert('Import failed');
      } finally {
        loadingEl.textContent = '';
        importInput.value = '';
      }
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      favoritesMode = btn.dataset.tab === 'favorites';
      memories = [];
      total = null;
      offset = 0;
      lastMonthLabel = null;
      grid.innerHTML = '';

      if (favoritesMode) {
        fetchFavorites();
      } else {
        fetchMore();
      }
    });
  });

  fetchMore();
});
