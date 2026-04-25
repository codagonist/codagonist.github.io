/* scan.js — logic for scan.html */

let stream       = null;
let detector     = null;
let scanning     = true;
let torchTrack   = null;
let torchOn      = false;
let scanCooldown = false;

// ── camera ──────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      }
    });

    const video = document.getElementById('camera-video');
    video.srcObject = stream;
    await video.play();

    document.getElementById('camera-loading').style.display = 'none';
    document.getElementById('camera-hint').style.display    = 'block';

    const [track] = stream.getVideoTracks();
    const caps = track.getCapabilities?.() ?? {};
    if (caps.torch) {
      torchTrack = track;
      document.getElementById('torch-btn').style.display         = 'flex';
      document.getElementById('torch-placeholder').style.display = 'none';
    }

    initDetector();
  } catch {
    document.getElementById('camera-loading').innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" opacity="0.5">
        <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
        <path d="M12 8v5M12 16v.5" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span style="color:rgba(255,255,255,0.5);font-size:12px;text-align:center;padding:0 20px">
        Camera unavailable.<br>Use manual ISBN entry below.
      </span>`;
  }
}

// ── barcode detection ────────────────────────────────────────────────────────
async function initDetector() {
  try {
    detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8'] });
    requestAnimationFrame(scanFrame);
  } catch (e) {
    console.warn('BarcodeDetector not available:', e);
  }
}

async function scanFrame() {
  if (!scanning || !detector) return;
  const video = document.getElementById('camera-video');
  if (video.readyState >= 2) {
    try {
      const barcodes = await detector.detect(video);
      for (const bc of barcodes) {
        const val = bc.rawValue.replace(/\D/g, '');
        if ((val.startsWith('978') || val.startsWith('979')) && val.length === 13) {
          scanning = false;
          triggerFlash();
          await handleISBN(val);
          return;
        }
      }
    } catch { /* frame not ready */ }
  }
  requestAnimationFrame(scanFrame);
}

// ── torch ────────────────────────────────────────────────────────────────────
async function toggleTorch() {
  if (!torchTrack) return;
  torchOn = !torchOn;
  try {
    await torchTrack.applyConstraints({ advanced: [{ torch: torchOn }] });
    document.getElementById('torch-btn').classList.toggle('on', torchOn);
  } catch (e) {
    console.warn('Torch failed:', e);
  }
}

function triggerFlash() {
  const el = document.getElementById('scan-flash');
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ── manual input ─────────────────────────────────────────────────────────────
function handleManualISBN() {
  const input = document.getElementById('manual-input');
  const val   = input.value.replace(/\D/g, '');
  if (val.length < 10) {
    input.focus();
    input.style.borderColor = 'var(--red-mid)';
    setTimeout(() => { input.style.borderColor = ''; }, 1200);
    return;
  }
  handleISBN(val);
}

document.getElementById('manual-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleManualISBN();
});

// ── ISBN lookup ──────────────────────────────────────────────────────────────
async function handleISBN(isbn) {
  if (scanCooldown) return;
  scanCooldown = true;
  setTimeout(() => { scanCooldown = false; }, 2000);

  showLoading(isbn);

  const owned = Books.owns(isbn);
  const meta  = await Books.lookupISBN(isbn);

  if (!meta) { showError(isbn, owned); return; }
  showResult(isbn, meta, owned);
}

// ── UI states ────────────────────────────────────────────────────────────────
function hideAll() {
  document.getElementById('result-idle').style.display    = 'none';
  document.getElementById('result-loading').style.display = 'none';
  document.getElementById('result-card').style.display    = 'none';
  document.getElementById('result-error').style.display   = 'none';
}

function showLoading(isbn) {
  hideAll();
  document.getElementById('loading-isbn').textContent     = isbn;
  document.getElementById('result-loading').style.display = 'flex';
}

function showResult(isbn, meta, owned) {
  hideAll();

  const ownedBook = Books.getByISBN(isbn);

  // banner
  const banner = document.getElementById('result-banner');
  banner.className = 'result-banner ' + (owned ? 'owned' : 'missing');
  document.getElementById('banner-text').textContent = owned
    ? 'Already in your collection'
    : 'Not in your collection';

  // cover
  const cover = document.getElementById('result-cover');
  cover.style.background = ownedBook?.color ?? meta.color ?? 'var(--teal-light)';
  cover.innerHTML = `
    <img src="${meta.coverUrl}" alt="" onerror="this.remove()">
    ${meta.title.charAt(0)}`;

  // text
  document.getElementById('result-title').textContent  = meta.title;
  document.getElementById('result-author').textContent = meta.author;

  // pills
  const langMap = { en:'English', nl:'Dutch', de:'German', fr:'French',
                    es:'Spanish', it:'Italian', pt:'Portuguese', ja:'Japanese' };
  const pills = [
    meta.language     && (langMap[meta.language] ?? meta.language.toUpperCase()),
    meta.pageCount    && `${meta.pageCount} pages`,
    meta.publishedDate && String(meta.publishedDate).slice(0, 4),
    meta.genre?.[0]?.split(' / ')[0],
  ].filter(Boolean);

  document.getElementById('result-meta').innerHTML =
    pills.map(p => `<span class="meta-pill">${p}</span>`).join('');

  // description
  const descEl = document.getElementById('result-desc');
  if (meta.description) {
    const short = meta.description.length > 180
      ? meta.description.slice(0, 180).trimEnd() + '…'
      : meta.description;
    descEl.textContent   = short;
    descEl.style.display = 'block';
  } else {
    descEl.style.display = 'none';
  }

  // actions
  document.getElementById('result-actions').innerHTML = owned
    ? `<button class="result-action-btn" onclick="resetResult()">
         <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
           <path d="M4 10a6 6 0 1 1 .6 2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
           <path d="M4 13V10H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
         </svg>Scan another</button>
       <button class="result-action-btn" onclick="location.href='detail.html?isbn=${isbn}'">
         <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
           <circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.5"/>
           <path d="M10 9v5M10 7v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
         </svg>View in library</button>`
    : `<button class="result-action-btn" onclick="resetResult()">
         <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
           <path d="M4 10a6 6 0 1 1 .6 2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
           <path d="M4 13V10H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
         </svg>Scan another</button>
       <button class="result-action-btn primary" id="add-btn" onclick="addToCollection('${isbn}')">
         <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
           <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
         </svg>Add to collection</button>`;

  document.getElementById('result-card').style.display = 'block';
}

function showError(isbn, owned) {
  hideAll();
  document.getElementById('result-error-sub').textContent = owned
    ? 'This book is in your collection but metadata could not be loaded.'
    : `No book found for ISBN ${isbn}. Try scanning again or check the number.`;
  document.getElementById('result-error').style.display = 'block';
}

function resetResult() {
  hideAll();
  document.getElementById('result-idle').style.display = 'flex';
  document.getElementById('manual-input').value = '';
  scanning     = true;
  scanCooldown = false;
  requestAnimationFrame(scanFrame);
}

// ── add to collection ────────────────────────────────────────────────────────
async function addToCollection(isbn) {
  const btn = document.getElementById('add-btn');
  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none"
    style="animation:spin 0.6s linear infinite">
    <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"
      stroke-dasharray="22" stroke-dashoffset="8"/></svg>Adding…`;

  const meta = await Books.lookupISBN(isbn);
  if (!meta) {
    btn.textContent = 'Could not load metadata';
    btn.disabled    = false;
    return;
  }

  const added = Books.add({ ...meta, status: 'unread', rating: 0 });

  if (added) {
    btn.innerHTML  = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M4 10l4 4 8-8" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"/></svg>Added!`;
    btn.style.color = 'var(--teal)';
    setTimeout(() => {
      document.getElementById('result-banner').className = 'result-banner owned';
      document.getElementById('banner-text').textContent = 'Added to your collection';
    }, 600);
  } else {
    btn.textContent = 'Already in collection';
  }
}

// ── cleanup ──────────────────────────────────────────────────────────────────
window.addEventListener('pagehide', () => {
  stream?.getTracks().forEach(t => t.stop());
});

// ── init ─────────────────────────────────────────────────────────────────────
Books.seedIfNeeded();
startCamera();
