/* home.js — logic for index.html */

const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function updateDate() {
  const now = new Date();
  const el  = document.querySelector('.hero-eyebrow');
  if (el) el.textContent =
    `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

function updateStats() {
  const s = Books.stats();
  document.getElementById('stat-total').textContent  = s.total;
  document.getElementById('stat-read').textContent   = s.read;
  document.getElementById('stat-unread').textContent = s.unread;
}

function renderRecent() {
  const container = document.getElementById('recent-list');
  const recent = Books.getAll()
    .sort((a, b) => (b.dateAdded ?? '').localeCompare(a.dateAdded ?? ''))
    .slice(0, 3);

  if (recent.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:24px 0;color:var(--ink-faint);font-size:13px;">
        No books yet — scan one to get started!
      </div>`;
    return;
  }

  container.innerHTML = recent.map(book => {
    const initials = book.title.split(' ').slice(0, 2).map(w => w[0]).join('');
    const dateStr  = formatDate(book.dateAdded);
    return `
      <div class="book-item" onclick="location.href='detail.html?isbn=${book.isbn}'">
        <div class="book-cover" style="background:${book.color ?? '#B5D4F4'}">
          ${book.coverUrl ? `<img src="${book.coverUrl}" alt="" onerror="this.remove()">` : ''}
          <span class="initials">${initials}</span>
        </div>
        <div class="book-meta">
          <div class="book-title-text">${esc(book.title)}</div>
          <div class="book-author-text">${esc(book.author)}</div>
        </div>
        <div class="book-date">${dateStr}</div>
      </div>`;
  }).join('');
}

function formatDate(iso) {
  if (!iso) return '';
  const d    = new Date(iso);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── init ────────────────────────────────────────────────────────────────────
updateDate();
Books.seedIfNeeded().then(() => {
  updateStats();
  renderRecent();
});