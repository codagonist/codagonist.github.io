/* library.js — logic for library.html */

// must match .book-row height in library.css
const ITEM_H      = 72;
const ITEM_GAP    = 8;
const ITEM_STRIDE = ITEM_H + ITEM_GAP;
const BUFFER      = 5;

let activeFilter = 'all';
let sortMode     = 'alpha';
let viewMode     = 'list';
let visibleBooks = [];

const SORT_CYCLE  = ['alpha', 'alpha-desc', 'recent'];
const SORT_LABELS = { alpha: 'A–Z', 'alpha-desc': 'Z–A', recent: 'Recent' };

// ── filter & sort ────────────────────────────────────────────────────────────
function applyFilter() {
  return Books.getAll().filter(b => {
    if (activeFilter === 'all')    return true;
    if (activeFilter === 'read')   return b.status === 'read';
    if (activeFilter === 'unread') return b.status === 'unread';
    return (b.genre ?? []).includes(activeFilter);
  });
}

function applySort(list) {
  return [...list].sort((a, b) => {
    if (sortMode === 'alpha')      return a.title.localeCompare(b.title);
    if (sortMode === 'alpha-desc') return b.title.localeCompare(a.title);
    return (b.dateAdded ?? '').localeCompare(a.dateAdded ?? '');
  });
}

function setFilter(f, el) {
  activeFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  refresh();
}

function cycleSort() {
  const idx = SORT_CYCLE.indexOf(sortMode);
  sortMode  = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
  document.getElementById('sort-label').textContent = SORT_LABELS[sortMode];
  refresh();
}

// ── view toggle ──────────────────────────────────────────────────────────────
function setView(v) {
  viewMode = v;
  document.getElementById('btn-list').classList.toggle('active', v === 'list');
  document.getElementById('btn-grid').classList.toggle('active', v === 'grid');
  document.getElementById('scroll-outer').style.display = v === 'list' ? 'block' : 'none';
  document.getElementById('grid-wrap').classList.toggle('active', v === 'grid');
  refresh();
}

// ── genre chips ──────────────────────────────────────────────────────────────
function buildGenreChips() {
  const genres = [...new Set(Books.getAll().flatMap(b => b.genre ?? []))].sort();
  const scroll = document.getElementById('filters-scroll');
  scroll.querySelectorAll('[data-genre]').forEach(el => el.remove());
  genres.forEach(g => {
    const btn = document.createElement('button');
    btn.className      = 'chip';
    btn.dataset.filter = g;
    btn.dataset.genre  = g;
    btn.textContent    = g;
    btn.onclick        = () => setFilter(g, btn);
    scroll.appendChild(btn);
  });
}

// ── main refresh ─────────────────────────────────────────────────────────────
function refresh() {
  visibleBooks = applySort(applyFilter());
  updateCount();
  updateAlphaBar();

  if (viewMode === 'list') renderVirtual();
  else renderGrid();

  const empty = document.getElementById('state-empty');
  empty.classList.toggle('visible', visibleBooks.length === 0);
}

function updateCount() {
  const n = visibleBooks.length;
  document.getElementById('count-text').innerHTML =
    `<strong>${n}</strong> book${n !== 1 ? 's' : ''}`;
}

// ── virtual scroll ───────────────────────────────────────────────────────────
let rafPending = false;

function renderVirtual() {
  const outer = document.getElementById('scroll-outer');
  const inner = document.getElementById('scroll-inner');
  const total = visibleBooks.length;
  const totalH = total * ITEM_STRIDE - (total > 0 ? ITEM_GAP : 0);

  inner.style.height = totalH + 'px';
  inner.innerHTML    = '';

  paintVisible();

  outer.onscroll = () => {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => { paintVisible(); rafPending = false; });
    }
  };
}

function paintVisible() {
  const outer      = document.getElementById('scroll-outer');
  const inner      = document.getElementById('scroll-inner');
  const total      = visibleBooks.length;
  const scrollTop  = outer.scrollTop;
  const viewHeight = outer.clientHeight;

  const firstIdx = Math.max(0, Math.floor(scrollTop / ITEM_STRIDE) - BUFFER);
  const lastIdx  = Math.min(total - 1, Math.ceil((scrollTop + viewHeight) / ITEM_STRIDE) + BUFFER);

  const rendered = new Set(
    [...inner.querySelectorAll('.virt-item')].map(el => parseInt(el.dataset.idx))
  );

  inner.querySelectorAll('.virt-item').forEach(el => {
    const i = parseInt(el.dataset.idx);
    if (i < firstIdx || i > lastIdx) el.remove();
  });

  for (let i = firstIdx; i <= lastIdx; i++) {
    if (rendered.has(i)) continue;
    const wrapper = document.createElement('div');
    wrapper.className   = 'virt-item';
    wrapper.dataset.idx = i;
    wrapper.style.top   = (i * ITEM_STRIDE) + 'px';
    wrapper.innerHTML   = buildListRow(visibleBooks[i]);
    inner.appendChild(wrapper);
  }
}

function buildListRow(book) {
  const initials  = book.title.split(' ').slice(0, 2).map(w => w[0]).join('');
  const genre     = book.genre?.[0] ?? '';
  const coverImg = book.coverUrl
    ? `<img src="${book.coverUrl}" alt="" loading="lazy" onerror="this.remove()">`
    : `<img src="https://covers.openlibrary.org/b/isbn/${book.isbn}-S.jpg?default=false" alt="" loading="lazy" onerror="this.remove()">`;
  return `
    <div class="book-row" onclick="location.href='detail.html?isbn=${book.isbn}'">
      <div class="book-cover" style="background:${book.color ?? '#B5D4F4'}">
        ${coverImg}
        <span class="initials">${initials}</span>
      </div>
      <div class="book-meta">
        <div class="book-title">${esc(book.title)}</div>
        <div class="book-author">${esc(book.author)}</div>
      </div>
      <div class="book-right">
        <div class="status-dot ${book.status ?? 'unread'}"></div>
        <div class="book-genre">${esc(genre)}</div>
      </div>
    </div>`;
}

// ── grid render ──────────────────────────────────────────────────────────────
function renderGrid() {
  document.getElementById('grid-inner').innerHTML = visibleBooks.map(book => {
    const initials = book.title.split(' ').slice(0, 2).map(w => w[0]).join('');
    const coverImg = book.coverUrl
      ? `<img src="${book.coverUrl}" alt="" loading="lazy" onerror="this.remove()">`
      : `<img src="https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg?default=false" alt="" loading="lazy" onerror="this.remove()">`;
    return `
      <div class="grid-item" onclick="location.href='detail.html?isbn=${book.isbn}'">
        <div class="grid-cover" style="background:${book.color ?? '#B5D4F4'}">
          ${coverImg}
          <span class="initials">${initials}</span>
          <div class="grid-status ${book.status ?? 'unread'}"></div>
        </div>
        <div class="grid-title">${esc(book.title)}</div>
        <div class="grid-author">${esc(book.author)}</div>
      </div>`;
  }).join('');
}

// ── alphabet jump ────────────────────────────────────────────────────────────
let toastTimer = null;

function updateAlphaBar() {
  const bar  = document.getElementById('alpha-bar');
  const show = viewMode === 'list' && sortMode === 'alpha' && visibleBooks.length > 20;
  bar.classList.toggle('visible', show);
  if (!show) { bar.innerHTML = ''; return; }

  const letters = [...new Set(
    visibleBooks.map(b => b.title[0].toUpperCase()).filter(c => /[A-Z]/.test(c))
  )].sort();

  bar.innerHTML = letters.map(l =>
    `<div class="alpha-letter" data-letter="${l}">${l}</div>`
  ).join('');

  bar.querySelectorAll('.alpha-letter').forEach(el => {
    el.addEventListener('click',      () => jumpToLetter(el.dataset.letter, el));
    el.addEventListener('touchstart', e  => { e.preventDefault(); jumpToLetter(el.dataset.letter, el); },
      { passive: false });
  });
}

function jumpToLetter(letter, el) {
  const idx = visibleBooks.findIndex(b => b.title[0].toUpperCase() === letter);
  if (idx === -1) return;

  document.getElementById('scroll-outer').scrollTo({ top: idx * ITEM_STRIDE, behavior: 'smooth' });

  el.classList.add('touched');
  setTimeout(() => el.classList.remove('touched'), 400);

  const toast = document.getElementById('jump-toast');
  toast.textContent = letter;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 600);
}

// ── helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── init ─────────────────────────────────────────────────────────────────────
Books.seedIfNeeded().then(() => {
  buildGenreChips();
  refresh();
});
