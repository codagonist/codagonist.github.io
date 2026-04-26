/* detail.js — logic for detail.html */

const LANG_NAMES = {
  en:'English', nl:'Dutch', de:'German', fr:'French',
  es:'Spanish', it:'Italian', pt:'Portuguese', ja:'Japanese',
};

const STATUS_CYCLE  = ['unread', 'reading', 'read'];
const STATUS_LABELS = { unread: 'Unread', reading: 'Reading', read: 'Read' };

const DESC_LIMIT = 220;

let book         = null;
let descExpanded = false;

// ── bootstrap ────────────────────────────────────────────────────────────────
const isbn = new URLSearchParams(location.search).get('isbn');
if (!isbn) location.replace('index.html');

Books.seedIfNeeded().then(() => {
  book = Books.getByISBN(isbn);
  if (book) {
    initPage();
  } else {
    showNotFound();
  }
});

function initPage() {
  document.title = `${book.title} — My Books`;
  document.getElementById('hero-title').textContent  = book.title;
  document.getElementById('hero-author').textContent = book.author;
  renderCover();
  renderStatus();
  renderRating();
  renderPills();
  renderDesc();
  renderMetaTable();
}

function updateRemoveCoverBtn() {
  const btn = document.getElementById('remove-cover-btn');
  if (btn) btn.style.display = book.coverUrl ? 'block' : 'none';
}

function showNotFound() {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;
                justify-content:center;min-height:100dvh;gap:12px;
                font-family:'DM Sans',sans-serif;color:var(--ink-muted);
                text-align:center;padding:24px;background:var(--bg)">
      <div style="font-family:'DM Serif Display',serif;font-size:20px;color:var(--ink)">
        Book not found
      </div>
      <div style="font-size:13px">ISBN ${esc(isbn)} is not in your collection.</div>
      <a href="library.html"
         style="margin-top:8px;padding:10px 20px;border-radius:10px;
                background:var(--teal);color:#fff;text-decoration:none;
                font-size:14px;font-weight:500">
        Back to library
      </a>
    </div>`;
}

// ── persist ──────────────────────────────────────────────────────────────────
function persist() {
  Books.update(book.isbn, book);
}

// ── cover ────────────────────────────────────────────────────────────────────
let cameraStream = null;

function renderCover() {
  const el       = document.getElementById('cover');
  const initials = book.title.split(' ').slice(0, 2).map(w => w[0]).join('');

  el.style.background = book.color ?? '#B5D4F4';
  el.onclick          = openCameraCapture;
  el.title            = 'Tap to set cover photo';
  el.style.cursor     = 'pointer';

  if (book.coverUrl) {
    el.innerHTML = `
      <img src="${book.coverUrl}" alt="" onerror="this.remove()">
      <span class="initials">${initials}</span>
      <div class="cover-camera-hint">📷</div>`;
  } else {
    // no cover — show prominent camera prompt
    el.innerHTML = `
      <span class="initials">${initials}</span>
      <div class="cover-camera-hint">📷</div>`;
  }
}

// ── camera capture ────────────────────────────────────────────────────────────
function openCameraCapture() {
  updateRemoveCoverBtn();
  document.getElementById('camera-overlay').classList.add('visible');
  startCoverCamera();
}

async function startCoverCamera() {
  const video = document.getElementById('cover-video');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }
    });
    video.srcObject = cameraStream;
    await video.play();
    document.getElementById('cover-camera-loading').style.display = 'none';
    document.getElementById('cover-camera-ui').style.display      = 'flex';
  } catch {
    document.getElementById('cover-camera-loading').textContent =
      'Camera unavailable. Please allow camera access.';
  }
}

function stopCoverCamera() {
  cameraStream?.getTracks().forEach(t => t.stop());
  cameraStream = null;
  const video = document.getElementById('cover-video');
  video.srcObject = null;
  document.getElementById('cover-camera-loading').style.display = 'flex';
  document.getElementById('cover-camera-ui').style.display      = 'none';
}

function closeCameraCapture() {
  stopCoverCamera();
  document.getElementById('camera-overlay').classList.remove('visible');
  document.getElementById('cover-preview-wrap').style.display = 'none';
  document.getElementById('cover-viewfinder').style.display   = 'flex';
}

function capturePhoto() {
  const video  = document.getElementById('cover-video');
  const canvas = document.createElement('canvas');

  // crop to a portrait book-cover ratio (2:3) from the centre of the frame
  const srcW  = video.videoWidth;
  const srcH  = video.videoHeight;
  const ratio = 2 / 3;
  let cropW, cropH, cropX, cropY;

  if (srcW / srcH > ratio) {
    cropH = srcH;
    cropW = Math.round(srcH * ratio);
    cropX = Math.round((srcW - cropW) / 2);
    cropY = 0;
  } else {
    cropW = srcW;
    cropH = Math.round(srcW / ratio);
    cropX = 0;
    cropY = Math.round((srcH - cropH) / 2);
  }

  // output at a fixed size — large enough for a crisp cover, small enough for localStorage
  const outW = 300;
  const outH = 450;
  canvas.width  = outW;
  canvas.height = outH;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

  // show preview
  document.getElementById('cover-preview-img').src    = dataUrl;
  document.getElementById('cover-viewfinder').style.display   = 'none';
  document.getElementById('cover-preview-wrap').style.display = 'flex';

  // store temporarily
  document.getElementById('cover-preview-wrap').dataset.dataUrl = dataUrl;
}

function retakePhoto() {
  document.getElementById('cover-preview-wrap').style.display = 'none';
  document.getElementById('cover-viewfinder').style.display   = 'flex';
}

function confirmPhoto() {
  const dataUrl = document.getElementById('cover-preview-wrap').dataset.dataUrl;
  if (!dataUrl) return;

  book.coverUrl = dataUrl;
  persist();
  closeCameraCapture();
  renderCover();
  flashSaved(document.getElementById('cover'));
}

function removeCover() {
  book.coverUrl = null;
  persist();
  // also clear from cache so a re-lookup can find a better one
  try {
    const cacheKey = 'books.cache.' + Books.cleanISBN(book.isbn);
    const cached   = JSON.parse(localStorage.getItem(cacheKey) ?? 'null');
    if (cached) { cached.coverUrl = null; localStorage.setItem(cacheKey, JSON.stringify(cached)); }
  } catch { /* ignore */ }
  closeCameraCapture();
  renderCover();
}

// close overlay when tapping backdrop
document.getElementById('camera-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('camera-overlay')) closeCameraCapture();
});

// ── status ───────────────────────────────────────────────────────────────────
function renderStatus() {
  const s     = book.status ?? 'unread';
  const badge = document.getElementById('status-badge');
  badge.className = `status-badge ${s}`;
  badge.innerHTML = `<span class="status-dot"></span>${STATUS_LABELS[s]}`;
}

function cycleStatus() {
  const idx   = STATUS_CYCLE.indexOf(book.status ?? 'unread');
  book.status = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];

  if (book.status === 'read' && !book.dateRead) {
    book.dateRead = new Date().toISOString().slice(0, 10);
  }
  if (book.status !== 'read') book.dateRead = null;

  persist();
  renderStatus();
  renderMetaTable();
  flashSaved(document.getElementById('status-badge'));
}

// ── rating ───────────────────────────────────────────────────────────────────
function renderRating() {
  document.getElementById('rating-wrap').innerHTML = [1,2,3,4,5].map(n => `
    <svg class="star ${n <= (book.rating ?? 0) ? 'filled' : ''}"
         viewBox="0 0 24 24" fill="currentColor"
         onclick="setRating(${n})"
         onmouseover="previewRating(${n})"
         onmouseout="renderRating()">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>`).join('');
}

function previewRating(n) {
  document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('filled', i < n));
}

function setRating(n) {
  book.rating = (book.rating ?? 0) === n ? 0 : n;
  persist();
  renderRating();
}

// ── pills ────────────────────────────────────────────────────────────────────
function renderPills() {
  const pills = [];
  (book.genre ?? []).forEach(g => pills.push({ icon: bookIcon(), label: g }));
  if (book.language)    pills.push({ icon: globeIcon(), label: LANG_NAMES[book.language] ?? book.language.toUpperCase() });
  if (book.pageCount)   pills.push({ icon: pageIcon(),  label: `${book.pageCount} pages` });
  if (book.publishedDate) pills.push({ icon: calIcon(), label: String(book.publishedDate).slice(0, 4) });

  document.getElementById('pills-wrap').innerHTML =
    pills.map(p => `<div class="pill">${p.icon} ${esc(p.label)}</div>`).join('');
}

// ── meta table ───────────────────────────────────────────────────────────────
function renderMetaTable() {
  const rows = [
    ['ISBN',      book.isbn],
    ['Publisher', book.publisher],
    ['Published', book.publishedDate],
    ['Language',  LANG_NAMES[book.language] ?? book.language],
    ['Pages',     book.pageCount],
    ['Added',     formatDate(book.dateAdded)],
    ['Read on',   book.dateRead ? formatDate(book.dateRead) : null],
  ].filter(([, v]) => v);

  document.getElementById('meta-table').innerHTML = rows.map(([k, v]) => `
    <div class="meta-row">
      <span class="meta-key">${esc(k)}</span>
      <span class="meta-val">${esc(String(v))}</span>
    </div>`).join('');
}

// ── description ──────────────────────────────────────────────────────────────
function renderDesc() {
  const el     = document.getElementById('desc-text');
  const toggle = document.getElementById('desc-toggle');
  const desc   = book.description || 'No description available.';
  const long   = desc.length > DESC_LIMIT;

  if (!long || descExpanded) {
    el.textContent     = desc;
    toggle.textContent = long ? 'Show less' : '';
  } else {
    el.textContent     = desc.slice(0, DESC_LIMIT).trimEnd() + '…';
    toggle.textContent = 'Show more';
  }
}

function toggleDesc() {
  descExpanded = !descExpanded;
  renderDesc();
}

// ── accordion ────────────────────────────────────────────────────────────────
function toggleSection(id) {
  document.getElementById(id).classList.toggle('open');
}

// ── delete ───────────────────────────────────────────────────────────────────
function showDeleteSheet() {
  document.getElementById('sheet-sub').textContent =
    `"${book.title}" will be removed from your collection. This can't be undone.`;
  document.getElementById('delete-overlay').classList.add('visible');
}

function hideDeleteSheet(e) {
  if (e && e.target !== document.getElementById('delete-overlay')) return;
  document.getElementById('delete-overlay').classList.remove('visible');
}

function deleteBook() {
  Books.remove(book.isbn);
  location.replace('library.html');
}

// ── share ────────────────────────────────────────────────────────────────────
function shareBook() {
  const text = `${book.title} by ${book.author}`;
  if (navigator.share) {
    navigator.share({ title: book.title, text, url: location.href });
  } else {
    navigator.clipboard.writeText(text)
      .then(() => flashSaved(document.getElementById('share-btn')));
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  const d      = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function flashSaved(el) {
  if (!el) return;
  el.style.outline = '2px solid var(--teal-mid)';
  setTimeout(() => { el.style.outline = ''; }, 700);
}

// icon helpers
const bookIcon  = () => `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="9" height="13" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M5 1v13" stroke="currentColor" stroke-width="1.3"/></svg>`;
const globeIcon = () => `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M8 2c-2 2-2 8 0 12M8 2c2 2 2 8 0 12M2 8h12" stroke="currentColor" stroke-width="1.3"/></svg>`;
const pageIcon  = () => `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const calIcon   = () => `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M1 7h14M5 1v4M11 1v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
