// Translation overlay for the PDF.js pre-built viewer.
// Runs as a module inside an extension page so chrome.runtime is available.

// ── Load the PDF ──────────────────────────────────────────────────────────────
// The URL is in the hash as #translate-file=<encoded-url> so the viewer's
// built-in ?file= handler (which enforces same-origin) is never triggered.
const hashParams = new URLSearchParams(window.location.hash.slice(1));
const pdfUrl = hashParams.get('translate-file');

// ── Bookmark: storage key per PDF URL ────────────────────────────────────────
const storageKey = pdfUrl ? 'bookmark:' + pdfUrl : null;

// Inject toast keyframes once
const toastStyle = document.createElement('style');
toastStyle.textContent = '@keyframes tb-fadein { from { opacity:0; transform:translateX(-50%) translateY(6px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }';
document.head.appendChild(toastStyle);

if (pdfUrl) {
  (async () => {
    await window.PDFViewerApplication.initializedPromise;
    await window.PDFViewerApplication.open({ url: pdfUrl });

    window.PDFViewerApplication.eventBus.on('documentloaded', async () => {
      // Restore saved page
      const saved = await chrome.storage.local.get(storageKey);
      const savedPage = Number(saved[storageKey]);
      if (Number.isInteger(savedPage) && savedPage > 1) {
        window.PDFViewerApplication.eventBus.on('pagesloaded', () => {
          try {
            const total = window.PDFViewerApplication.pdfDocument?.numPages ?? 0;
            const page  = total ? Math.min(savedPage, total) : savedPage;
            window.PDFViewerApplication.pdfViewer.scrollPageIntoView({ pageNumber: page });
            showToast(`Resumed from page ${page}`);
          } catch {
            // Viewer not ready — skip silently
          }
        }, { once: true });
      }

      // Debounced scroll — reads the truly visible page, not one entering the viewport
      const viewerContainer = document.getElementById('viewerContainer');
      if (!viewerContainer) return;

      let scrollTimer = null;
      viewerContainer.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const page = window.PDFViewerApplication.pdfViewer?.currentPageNumber;
          if (Number.isInteger(page)) {
            chrome.storage.local.set({ [storageKey]: page });
          }
        }, 500);
      });
    });
  })();
}

// ── "Open in Chrome viewer" toolbar button ────────────────────────────────────
if (pdfUrl) {
  window.PDFViewerApplication.initializedPromise.then(() => {
    const toolbar = document.getElementById('toolbarViewerRight');
    if (!toolbar) return;

    const btn = document.createElement('button');
    btn.title = 'Open in Chrome viewer';
    btn.className = 'toolbarButton';
    btn.style.cssText = 'font-size:12px;padding:0 8px;white-space:nowrap;display:flex;align-items:center;gap:4px;color:inherit;';
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg> Chrome viewer';
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_IN_CHROME', url: pdfUrl });
    });
    toolbar.prepend(btn);
  });
}

// ── Translation bubble ────────────────────────────────────────────────────────
const bubble           = document.getElementById('tb');
const tbWord           = document.getElementById('tb-word');
const tbPosRow         = document.getElementById('tb-pos-row');
const tbLoad           = document.getElementById('tb-loading');
const tbBody           = document.getElementById('tb-body');
const tbEnExplanation  = document.getElementById('tb-en-explanation');
const tbExamples       = document.getElementById('tb-examples');
const tbTranslation    = document.getElementById('tb-translation-text');
const tbTargetExp      = document.getElementById('tb-target-explanation');
const tbTranslatedEx   = document.getElementById('tb-translated-example');
const tbContextDetails = document.getElementById('tb-context-details');
const tbContextLabel   = document.getElementById('tb-context-label');
const tbContextText    = document.getElementById('tb-context-text');
const tbContextToggle  = document.getElementById('tb-context-toggle');
const tbClose          = document.getElementById('tb-close');

if (!bubble || !tbClose) {
  console.error('[PDF Translate] Bubble HTML elements missing — translation disabled.');
} else {
  tbClose.addEventListener('click', hide);

  tbContextDetails?.addEventListener('toggle', () => {
    if (tbContextToggle) tbContextToggle.textContent = tbContextDetails.open ? '▼' : '▶';
  });

  document.addEventListener('mousedown', (e) => {
    if (!bubble.contains(e.target)) hide();
  });

  let timer = null;
  document.addEventListener('mouseup', (e) => {
    if (bubble.contains(e.target)) return;
    clearTimeout(timer);
    timer = setTimeout(handleSelection, 350);
  });
}

function hide() {
  if (bubble) bubble.style.display = 'none';
}

async function handleSelection() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;

  const text = selection.toString().trim();
  if (!text || text.length < 2) return;

  const range = selection.getRangeAt(0);
  const context = extractContext(selection);

  positionBubble(range.getBoundingClientRect());

  // Reset state
  tbWord.textContent    = text;
  tbPosRow.innerHTML    = '';
  tbLoad.style.display  = 'block';
  tbBody.style.display  = 'none';
  tbExamples.innerHTML  = '';

  // Context section
  if (context) {
    const words = context.trim().split(/\s+/).length;
    tbContextLabel.textContent   = `Context: ${words} words, ${context.length} chars`;
    tbContextText.textContent    = context;
    tbContextDetails.open        = false;
    tbContextToggle.textContent  = '▶';
    tbContextDetails.style.display = 'block';
  } else {
    tbContextDetails.style.display = 'none';
  }

  bubble.style.display = 'block';

  try {
    const res = await chrome.runtime.sendMessage({ type: 'TRANSLATE', word: text, context });
    tbLoad.style.display = 'none';

    if (res.error) {
      tbEnExplanation.textContent = res.error;
      tbEnExplanation.classList.add('tb-error');
      tbBody.style.display = 'block';
      return;
    }

    tbEnExplanation.classList.remove('tb-error');
    const c = res.card;

    // Part of speech badge
    if (c.partOfSpeech) {
      const posBadge = document.createElement('span');
      posBadge.className   = 'tb-badge tb-badge-pos';
      posBadge.textContent = c.partOfSpeech;
      tbPosRow.appendChild(posBadge);
    }

    // Verb form badge — verbForm is proper null from JSON, not the string "null"
    if (c.verbForm) {
      const formBadge = document.createElement('span');
      formBadge.className   = 'tb-badge tb-badge-form';
      formBadge.textContent = c.verbForm;
      tbPosRow.appendChild(formBadge);
    }

    tbEnExplanation.textContent = c.englishExplanation || '';

    (c.examples || []).forEach(ex => {
      const li = document.createElement('li');
      li.textContent = ex;
      tbExamples.appendChild(li);
    });

    tbTranslation.textContent  = c.translation || '';
    tbTargetExp.textContent    = c.targetExplanation || '';
    tbTranslatedEx.textContent = c.translatedExample || '';

    tbBody.style.display = 'block';

  } catch {
    tbLoad.style.display = 'none';
    tbEnExplanation.textContent = 'Analysis failed. Check your API key in the extension popup.';
    tbEnExplanation.classList.add('tb-error');
    tbBody.style.display = 'block';
  }
}

function extractContext(selection) {
  if (!selection.rangeCount) return '';

  const selectedText = selection.toString().trim();
  let node = selection.getRangeAt(0).commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && !node.classList?.contains('textLayer')) node = node.parentElement;
  if (!node) return '';

  const pageText = node.textContent.replace(/\s+/g, ' ').trim();
  const idx = pageText.indexOf(selectedText);
  if (idx === -1) return pageText.slice(0, 500);

  const WINDOW = 250;
  const start  = Math.max(0, idx - WINDOW);
  const end    = Math.min(pageText.length, idx + selectedText.length + WINDOW);
  return pageText.slice(start, end);
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;z-index:99999;animation:tb-fadein 0.2s ease;pointer-events:none;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function positionBubble(rect) {
  const GAP  = 10;
  const W    = 380;
  const maxH = window.innerHeight * 0.8;

  let left = rect.left;
  if (left + W > window.innerWidth - GAP) left = window.innerWidth - W - GAP;
  if (left < GAP) left = GAP;

  let top = rect.bottom + GAP;
  if (top + maxH > window.innerHeight - GAP) top = rect.top - GAP - maxH;
  top = Math.max(GAP, Math.min(top, window.innerHeight - maxH - GAP));

  bubble.style.top  = top  + 'px';
  bubble.style.left = left + 'px';
}
