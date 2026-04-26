/* search.js — logic for search.html */

let query          = '';
let activeFilter   = 'all';
let sortMode       = 'alpha';
let userInteracted = true;
let currentPage    = 1;

const PAGE_SIZE  = 5;
const SORT_CYCLE = ['alpha', 'alpha-desc', 'recent'];
const SORT_LABELS = { alpha: 'A–Z', 'alpha-desc': 'Z–A', recent: 'Recent' };

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

function setFilter(f, el) {
  activeFilter   = f;
  userInteracted = true;
  currentPage    = 1;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  render();
}

// ── sort ─────────────────────────────────────────────────────────────────────
function cycleSort() {
  const idx = SORT_CYCLE.indexOf(sortMode);
  sortMode  = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
  document.getElementById('sort-label').textContent = SORT_LABELS[sortMode];
  currentPage = 1;
  render();
}

function sortBooks(list) {
  return [...list].sort((a, b) => {
    if (sortMode === 'alpha')      return a.title.localeCompare(b.title);
    if (sortMode === 'alpha-desc') return b.title.localeCompare(a.title);
    return (b.dateAdded ?? '').localeCompare(a.dateAdded ?? '');
  });
}

// ── filter ───────────────────────────────────────────────────────────────────
function filterBooks() {
  const q = query.trim().toLowerCase();
  return Books.getAll().filter(b => {
    const matchesFilter =
      activeFilter === 'all'    ? true :
      activeFilter === 'read'   ? b.status === 'read' :
      activeFilter === 'unread' ? b.status === 'unread' :
      (b.genre ?? []).includes(activeFilter);

    if (!q) return matchesFilter;

    return matchesFilter && (
      b.title.toLowerCase().includes(q)  ||
      b.author.toLowerCase().includes(q) ||
      b.isbn.includes(q)
    );
  });
}

// ── highlight ────────────────────────────────────────────────────────────────
function highlight(text, q) {
  if (!q) return esc(text);
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc(text).replace(new RegExp(safe, 'gi'), m => `<mark>${m}</mark>`);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── render ───────────────────────────────────────────────────────────────────
function render() {
  const q        = query.trim().toLowerCase();
  const results  = sortBooks(filterBooks());
  const hasQuery = q.length > 0;

  const idleEl     = document.getElementById('state-idle');
  const noResEl    = document.getElementById('state-no-results');
  const listEl     = document.getElementById('book-list');
  const countBar   = document.getElementById('count-bar');
  const countText  = document.getElementById('count-text');
  const pagination = document.getElementById('pagination');
  const scanPrompt = document.getElementById('scan-prompt');

  document.getElementById('clear-btn').classList.toggle('visible', hasQuery);

  if (!hasQuery && activeFilter === 'all' && !userInteracted) {
    idleEl.style.display    = 'flex';
    noResEl.style.display   = 'none';
    listEl.style.display    = 'none';
    countBar.style.display  = 'none';
    pagination.classList.remove('visible');
    return;
  }

  idleEl.style.display = 'none';

  if (results.length === 0) {
    noResEl.style.display  = 'flex';
    listEl.style.display   = 'none';
    countBar.style.display = 'none';
    pagination.classList.remove('visible');
    document.getElementById('no-results-sub').textContent = hasQuery
      ? `Nothing matches "${query}".`
      : 'No books in this category yet.';
    scanPrompt.classList.toggle('visible', hasQuery && !/^\d+$/.test(q));
    return;
  }

  noResEl.style.display  = 'none';
  listEl.style.display   = 'flex';
  countBar.style.display = 'flex';

  const total      = results.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = totalPages;

  const start     = (currentPage - 1) * PAGE_SIZE;
  const pageItems = results.slice(start, start + PAGE_SIZE);
  const showing   = `${start + 1}–${Math.min(start + PAGE_SIZE, total)}`;

  countText.innerHTML = hasQuery
    ? `<strong>${total}</strong> result${total !== 1 ? 's' : ''} for "${query}"`
    : totalPages > 1
      ? `Showing ${showing} of <strong>${total}</strong> books`
      : `<strong>${total}</strong> book${total !== 1 ? 's' : ''}`;

  listEl.innerHTML = pageItems.map((book, i) => {
    const initials = book.title.split(' ').slice(0, 2).map(w => w[0]).join('');
    const titleHl  = highlight(book.title,  q);
    const authorHl = highlight(book.author, q);
    const genre    = book.genre?.[0] ?? '';
    const coverSrc = book.coverUrl
      ?? `https://covers.openlibrary.org/b/isbn/${book.isbn}-S.jpg`;
    return `
      <div class="book-item" style="animation-delay:${Math.min(i * 0.03, 0.25)}s"
           onclick="location.href='detail.html?isbn=${book.isbn}'">
        <div class="book-cover" style="background:${book.color ?? '#B5D4F4'}">
          <img src="${coverSrc}"
               alt="" loading="lazy" onerror="this.style.display='none'">
          <span class="initials">${initials}</span>
        </div>
        <div class="book-meta">
          <div class="book-title-text">${titleHl}</div>
          <div class="book-author-text">${authorHl}</div>
        </div>
        <div class="book-right">
          <div class="status-dot ${book.status ?? 'unread'}"></div>
          <div class="book-genre">${esc(genre)}</div>
        </div>
      </div>`;
  }).join('');

  // pagination
  if (totalPages <= 1) {
    pagination.classList.remove('visible');
    return;
  }
  pagination.classList.add('visible');
  pagination.innerHTML = buildPagination(currentPage, totalPages);
}

// ── pagination ───────────────────────────────────────────────────────────────
function buildPagination(page, total) {
  const prev = `<button class="page-btn" ${page===1?'disabled':''} onclick="goToPage(${page-1})" aria-label="Previous">
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M13 5l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg></button>`;

  const next = `<button class="page-btn" ${page===total?'disabled':''} onclick="goToPage(${page+1})" aria-label="Next">
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M7 5l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg></button>`;

  const pages = pageNumbers(page, total);
  let nums = '', prev2 = null;
  for (const p of pages) {
    if (prev2 !== null && p - prev2 > 1) nums += `<span class="page-ellipsis">…</span>`;
    nums += `<button class="page-btn ${p === page ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
    prev2 = p;
  }

  return prev + nums + next;
}

function pageNumbers(current, total) {
  const set = new Set([1, total, current, current - 1, current + 1]);
  return [...set].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
}

function goToPage(page) {
  currentPage = page;
  render();
  document.getElementById('results-wrap').scrollTo({ top: 0, behavior: 'smooth' });
}

// ── input wiring ─────────────────────────────────────────────────────────────
const inputEl = document.getElementById('search-input');
let debounce;

inputEl.addEventListener('input', () => {
  query = inputEl.value;
  userInteracted = true;
  currentPage = 1;
  clearTimeout(debounce);
  debounce = setTimeout(render, 80);
});

document.getElementById('clear-btn').addEventListener('click', () => {
  inputEl.value = '';
  query = '';
  render();
  inputEl.focus();
});

// ── init ─────────────────────────────────────────────────────────────────────
Books.seedIfNeeded().then(() => {
  buildGenreChips();
  render();
});
