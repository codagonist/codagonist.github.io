/**
 * books.js — shared data layer for the book collection app
 *
 * All pages load this script before their own logic.
 * It exposes a global `Books` object with methods for
 * reading and writing the localStorage collection.
 *
 * Storage keys:
 *   books.collection  — JSON array of book objects
 *   books.cache.{isbn} — cached Google Books API response per ISBN
 *   books.seeded      — flag: true once default books.json has been imported
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

  // ── Google Books metadata cache ───────────────────────────────────────────

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
   * Look up ISBN metadata. Returns cached result immediately if available,
   * otherwise fetches from Google Books and caches the result.
   */
  async function lookupISBN(isbn) {
    const clean = cleanISBN(isbn);
    const cached = getCached(clean);
    if (cached) return cached;

    try {
      const res  = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`
      );
      const data = await res.json();
      if (!data.totalItems || !data.items?.length) return null;

      const info = data.items[0].volumeInfo;
      const meta = {
        isbn,
        title:         info.title          ?? 'Unknown title',
        author:        (info.authors ?? []).join(', '),
        authors:       info.authors        ?? [],
        genre:         info.categories     ?? [],
        language:      info.language       ?? 'en',
        pageCount:     info.pageCount      ?? null,
        publisher:     info.publisher      ?? '',
        publishedDate: info.publishedDate  ?? '',
        description:   info.description   ?? '',
        // prefer Google Books thumbnail, fallback to Open Library
        coverUrl: info.imageLinks?.thumbnail?.replace('http://', 'https://')
          ?? `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`,
        color: randomColor(),
      };

      setCache(clean, meta);
      return meta;
    } catch {
      return null;
    }
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
