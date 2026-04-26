/**
 * books.js — shared data layer for the book collection app
 *
 * All pages load this script before their own logic.
 * It exposes a global `Books` object with methods for
 * reading and writing the localStorage collection.
 *
 * Storage keys:
 *   books.collection   — JSON array of book objects
 *   books.cache.{isbn} — cached metadata per ISBN (Google Books or Open Library)
 *   books.seeded       — flag: true once default books.json has been imported
 */

const Books = (() => {

  const KEY_COLLECTION = 'books.collection';
  const KEY_SEEDED     = 'books.seeded';
  const CACHE_PREFIX   = 'books.cache.';

  // ── read / write ─────────────────────────────────────────────────────────

  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY_COLLECTION)) ?? [];
    } catch {
      return [];
    }
  }

  function saveAll(books) {
    localStorage.setItem(KEY_COLLECTION, JSON.stringify(books));
  }

  function getByISBN(isbn) {
    const clean = cleanISBN(isbn);
    return getAll().find(b => cleanISBN(b.isbn) === clean) ?? null;
  }

  function owns(isbn) {
    return getByISBN(isbn) !== null;
  }

  // ── add / update / remove ─────────────────────────────────────────────────

  function add(book) {
    const books = getAll();
    const clean = cleanISBN(book.isbn);
    if (books.some(b => cleanISBN(b.isbn) === clean)) return false; // already owned
    books.unshift({ ...book, dateAdded: today() }); // newest first
    saveAll(books);
    return true;
  }

  function update(isbn, changes) {
    const books = getAll();
    const clean = cleanISBN(isbn);
    const idx   = books.findIndex(b => cleanISBN(b.isbn) === clean);
    if (idx === -1) return false;
    books[idx] = { ...books[idx], ...changes };
    saveAll(books);
    return true;
  }

  function remove(isbn) {
    const books  = getAll();
    const clean  = cleanISBN(isbn);
    const filtered = books.filter(b => cleanISBN(b.isbn) !== clean);
    if (filtered.length === books.length) return false;
    saveAll(filtered);
    return true;
  }

  // ── metadata cache ────────────────────────────────────────────────────────

  function getCached(isbn) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + cleanISBN(isbn));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setCache(isbn, meta) {
    try {
      localStorage.setItem(CACHE_PREFIX + cleanISBN(isbn), JSON.stringify(meta));
    } catch {
      // localStorage quota exceeded — silently skip caching
    }
  }

  /**
   * Look up ISBN metadata using a fallback chain:
   *   1. localStorage cache (instant, no network)
   *   2. Google Books API (best English coverage)
   *   3. Open Library Search API (CORS-compatible, broader European coverage)
   *
   * Cover images use a separate fallback:
   *   1. Google Books thumbnail
   *   2. Open Library Covers API (checked via ?default=false to detect misses)
   *   3. null — camera photo can be set manually on detail page
   */
  async function lookupISBN(isbn) {
    const clean  = cleanISBN(isbn);
    const cached = getCached(clean);
    if (cached) return cached;

    // try Google Books first
    let meta = await _lookupGoogleBooks(clean);

    // fall back to Open Library if Google had no result
    if (!meta) meta = await _lookupOpenLibrary(clean);

    if (!meta) return null;

    // resolve best available cover
    meta.coverUrl = await _resolveCover(clean, meta.coverUrl);

    setCache(clean, meta);
    return meta;
  }

  async function _lookupGoogleBooks(clean) {
    try {
      const res  = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`
      );
      const data = await res.json();
      if (!data.totalItems || !data.items?.length) return null;

      const info = data.items[0].volumeInfo;
      return {
        isbn:          clean,
        title:         info.title                    ?? 'Unknown title',
        author:        (info.authors ?? []).join(', '),
        authors:       info.authors                  ?? [],
        genre:         info.categories               ?? [],
        language:      info.language                 ?? 'en',
        pageCount:     info.pageCount                ?? null,
        publisher:     info.publisher                ?? '',
        publishedDate: info.publishedDate            ?? '',
        description:   info.description              ?? '',
        coverUrl:      info.imageLinks?.thumbnail?.replace('http://', 'https://') ?? null,
        color:         randomColor(),
        _source:       'google',
      };
    } catch {
      return null;
    }
  }

  async function _lookupOpenLibrary(clean) {
    try {
      const res  = await fetch(
        `https://openlibrary.org/search.json?isbn=${clean}&limit=1&fields=title,author_name,subject,language,number_of_pages_median,publisher,first_publish_year,cover_i`
      );
      const data = await res.json();
      if (!data.numFound || !data.docs?.length) return null;

      const doc = data.docs[0];
      return {
        isbn:          clean,
        title:         doc.title                           ?? 'Unknown title',
        author:        (doc.author_name ?? []).join(', '),
        authors:       doc.author_name                     ?? [],
        genre:         (doc.subject ?? []).slice(0, 3),
        language:      doc.language?.[0]                   ?? 'en',
        pageCount:     doc.number_of_pages_median          ?? null,
        publisher:     doc.publisher?.[0]                  ?? '',
        publishedDate: doc.first_publish_year?.toString()  ?? '',
        description:   '',
        // Open Library cover by cover_i ID is more reliable than ISBN lookup
        coverUrl:      doc.cover_i
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
          : null,
        color:         randomColor(),
        _source:       'openlibrary',
      };
    } catch {
      return null;
    }
  }

  /**
   * Try to resolve the best available cover URL.
   * Uses ?default=false on Open Library to detect missing covers (returns 404)
   * rather than a blank placeholder image.
   */
  async function _resolveCover(clean, existingUrl) {
    // if we already have a cover from Google Books, use it
    if (existingUrl) return existingUrl;

    // try Open Library cover by ISBN
    const olUrl = `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg?default=false`;
    try {
      const res = await fetch(olUrl, { method: 'HEAD' });
      if (res.ok) return olUrl.replace('?default=false', '');
    } catch { /* no cover */ }

    // no cover found — return null so camera option is shown
    return null;
  }

  // ── seed from books.json on first load ────────────────────────────────────

  /**
   * Call once on app start. If localStorage has never been seeded,
   * fetches books.json and imports it. Safe to call on every page.
   */
  async function seedIfNeeded() {
    if (localStorage.getItem(KEY_SEEDED)) return;
    try {
      const res   = await fetch('./books.json');
      const data  = await res.json();
      const books = Array.isArray(data) ? data : (data.books ?? []);
      if (books.length) saveAll(books);
    } catch {
      // No books.json yet (local dev or first deploy) — start with empty collection
    }
    localStorage.setItem(KEY_SEEDED, '1');
  }

  // ── export / import ───────────────────────────────────────────────────────

  /** Download current collection as books.json */
  function exportJSON() {
    const books = getAll();
    const blob  = new Blob([JSON.stringify({ books }, null, 2)],
                           { type: 'application/json' });
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'books.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * Import a books.json file chosen by the user.
   * Merges with existing collection (no duplicates).
   * Returns { added, skipped } counts.
   */
  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data  = JSON.parse(e.target.result);
          const incoming = Array.isArray(data) ? data : (data.books ?? []);
          const existing = getAll();
          const existingISBNs = new Set(existing.map(b => cleanISBN(b.isbn)));

          let added = 0, skipped = 0;
          incoming.forEach(b => {
            if (existingISBNs.has(cleanISBN(b.isbn))) {
              skipped++;
            } else {
              existing.push(b);
              added++;
            }
          });

          saveAll(existing);
          localStorage.setItem(KEY_SEEDED, '1');
          resolve({ added, skipped });
        } catch {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
  }

  // ── stats ─────────────────────────────────────────────────────────────────

  function stats() {
    const books = getAll();
    return {
      total:  books.length,
      read:   books.filter(b => b.status === 'read').length,
      unread: books.filter(b => b.status === 'unread' || !b.status).length,
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  function cleanISBN(isbn) {
    return String(isbn ?? '').replace(/\D/g, '');
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  const COLORS = [
    '#B5D4F4','#9FE1CB','#FAC775','#CECBF6',
    '#F4C0D1','#C0DD97','#F5C4B3','#85B7EB',
  ];

  function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  // ── public API ────────────────────────────────────────────────────────────

  return {
    getAll, getByISBN, owns,
    add, update, remove,
    lookupISBN,
    seedIfNeeded,
    exportJSON, importJSON,
    stats,
    cleanISBN,
  };

})();
