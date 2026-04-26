/* edit.js — logic for edit.html */

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'nl', name: 'Dutch' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'ru', name: 'Russian' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
];

let book  = null;
let genre = [];

// ── bootstrap ────────────────────────────────────────────────────────────────
const isbn = new URLSearchParams(location.search).get('isbn');
if (!isbn) location.replace('index.html');

Books.seedIfNeeded().then(() => {
  book = Books.getByISBN(isbn);
  if (book) {
    initPage();
  } else {
    location.replace('library.html');
  }
});

function initPage() {
  document.title = `Edit — ${book.title}`;
  genre = [...(book.genre ?? [])];

  // populate all fields
  val('edit-title',         book.title         ?? '');
  val('edit-author',        book.author        ?? '');
  val('edit-description',   book.description   ?? '');
  val('edit-publisher',     book.publisher     ?? '');
  val('edit-publishedDate', book.publishedDate ?? '');
  val('edit-pageCount',     book.pageCount     ?? '');
  val('edit-isbn',          book.isbn          ?? '');

  // language select
  buildLanguageSelect();
  document.getElementById('edit-language').value = book.language ?? 'en';

  // genre tags
  renderGenreTags();

  // genre add on Enter
  document.getElementById('genre-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addGenre(); }
  });
}

function val(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v;
}

// ── language select ───────────────────────────────────────────────────────────
function buildLanguageSelect() {
  const sel = document.getElementById('edit-language');
  sel.innerHTML = LANGUAGES.map(l =>
    `<option value="${l.code}">${l.name}</option>`
  ).join('');
}

// ── genre tags ────────────────────────────────────────────────────────────────
function renderGenreTags() {
  const wrap = document.getElementById('genre-tags');
  wrap.innerHTML = genre.map(g => `
    <div class="genre-tag">
      <span>${esc(g)}</span>
      <button class="genre-tag-remove" onclick="removeGenre('${esc(g)}')" aria-label="Remove">✕</button>
    </div>`).join('');
}

function addGenre() {
  const input = document.getElementById('genre-input');
  const val   = input.value.trim();
  if (!val || genre.includes(val)) { input.value = ''; return; }
  genre.push(val);
  input.value = '';
  renderGenreTags();
}

function removeGenre(g) {
  genre = genre.filter(x => x !== g);
  renderGenreTags();
}

// ── save ──────────────────────────────────────────────────────────────────────
function saveChanges() {
  const title         = document.getElementById('edit-title').value.trim();
  const author        = document.getElementById('edit-author').value.trim();
  const description   = document.getElementById('edit-description').value.trim();
  const publisher     = document.getElementById('edit-publisher').value.trim();
  const publishedDate = document.getElementById('edit-publishedDate').value.trim();
  const pageCount     = document.getElementById('edit-pageCount').value.trim();
  const language      = document.getElementById('edit-language').value;
  const newIsbn       = document.getElementById('edit-isbn').value.trim().replace(/\D/g, '');

  if (!title) {
    document.getElementById('edit-title').focus();
    document.getElementById('edit-title').style.borderColor = 'var(--red-mid)';
    setTimeout(() => document.getElementById('edit-title').style.borderColor = '', 1500);
    return;
  }

  // also update the cache so re-lookups don't overwrite edits
  const cacheKey = 'books.cache.' + Books.cleanISBN(book.isbn);
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? 'null');
    if (cached) {
      cached.title         = title;
      cached.author        = author;
      cached.authors       = author.split(',').map(a => a.trim());
      cached.description   = description;
      cached.publisher     = publisher;
      cached.publishedDate = publishedDate;
      cached.pageCount     = pageCount ? parseInt(pageCount) : null;
      cached.language      = language;
      cached.genre         = genre;
      localStorage.setItem(cacheKey, JSON.stringify(cached));
    }
  } catch { /* cache update optional */ }

  Books.update(book.isbn, {
    title,
    author,
    authors:       author.split(',').map(a => a.trim()),
    description,
    publisher,
    publishedDate,
    pageCount:     pageCount ? parseInt(pageCount) : null,
    language,
    genre,
    isbn:          newIsbn || book.isbn,
  });

  // go back to detail page
  location.replace(`detail.html?isbn=${newIsbn || book.isbn}`);
}

function cancelEdit() {
  history.back();
}

// ── helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
