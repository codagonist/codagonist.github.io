/* settings.js — logic for settings.html */

// ── stats ────────────────────────────────────────────────────────────────────
function renderStats() {
  const s = Books.stats();
  document.getElementById('stat-total').textContent  = s.total;
  document.getElementById('stat-read').textContent   = s.read;
  document.getElementById('stat-unread').textContent = s.unread;
}

// ── app title ────────────────────────────────────────────────────────────────
const TITLE_KEY = 'books.appTitle';

function renderTitleSub() {
  const current = localStorage.getItem(TITLE_KEY) ?? 'my books';
  document.getElementById('title-sub').textContent = `Currently: "${current}"`;
}

function toggleTitleInput() {
  const wrap  = document.getElementById('title-input-wrap');
  const input = document.getElementById('title-input');
  const open  = wrap.classList.toggle('visible');
  if (open) {
    input.value = localStorage.getItem(TITLE_KEY) ?? 'my books';
    input.focus();
    input.select();
  }
}

function saveTitle() {
  const val = document.getElementById('title-input').value.trim();
  if (!val) return;
  localStorage.setItem(TITLE_KEY, val);
  document.getElementById('title-input-wrap').classList.remove('visible');
  renderTitleSub();
  showToast(`Title updated to "${val}"`, 'success');
}

document.getElementById('title-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveTitle();
  if (e.key === 'Escape') document.getElementById('title-input-wrap').classList.remove('visible');
});

// ── export ───────────────────────────────────────────────────────────────────
function exportCollection() {
  const total = Books.getAll().length;
  if (total === 0) {
    showToast('No books to export yet', 'error');
    return;
  }
  Books.exportJSON();
  showToast(`Exported ${total} book${total !== 1 ? 's' : ''}`, 'success');
}

// ── import ───────────────────────────────────────────────────────────────────
function toggleImport() {
  document.getElementById('import-drop').classList.toggle('visible');
}

// click on drop zone opens file picker
document.getElementById('drop-zone').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

// file picker selected
document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) handleImportFile(file);
  e.target.value = ''; // reset so same file can be re-selected
});

// drag and drop
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleImportFile(file);
});

async function handleImportFile(file) {
  if (!file.name.endsWith('.json')) {
    showToast('Please select a .json file', 'error');
    return;
  }
  try {
    const { added, skipped } = await Books.importJSON(file);
    document.getElementById('import-drop').classList.remove('visible');
    renderStats();

    const parts = [];
    if (added   > 0) parts.push(`${added} book${added !== 1 ? 's' : ''} added`);
    if (skipped > 0) parts.push(`${skipped} already owned`);
    showToast(parts.join(', '), 'success');
  } catch (e) {
    showToast('Invalid file — could not import', 'error');
  }
}

// ── clear collection ─────────────────────────────────────────────────────────
function showClearSheet() {
  const total = Books.getAll().length;
  document.getElementById('clear-sheet-sub').textContent =
    `This will permanently remove all ${total} book${total !== 1 ? 's' : ''} from your collection. Make sure you have exported a backup first.`;
  document.getElementById('clear-overlay').classList.add('visible');
}

function hideClearSheet(e) {
  if (e && e.target !== document.getElementById('clear-overlay')) return;
  document.getElementById('clear-overlay').classList.remove('visible');
}

function clearCollection() {
  localStorage.removeItem('books.collection');
  localStorage.removeItem('books.seeded');
  // also clear the metadata cache
  Object.keys(localStorage)
    .filter(k => k.startsWith('books.cache.'))
    .forEach(k => localStorage.removeItem(k));

  document.getElementById('clear-overlay').classList.remove('visible');
  renderStats();
  showToast('Collection cleared', 'success');
}

// ── toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className   = `toast${type ? ' ' + type : ''} visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ── init ─────────────────────────────────────────────────────────────────────
Books.seedIfNeeded().then(() => {
  renderStats();
  renderTitleSub();
});
