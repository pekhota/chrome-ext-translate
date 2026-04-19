// ---------- PDF interception ----------

// URLs the user explicitly asked to open in Chrome's native viewer (per-tab, one-shot)
const skipOnce = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading' || !tab.url) return;
  if (!isPdfUrl(tab.url)) return;
  if (tab.url.startsWith(chrome.runtime.getURL(''))) return;

  if (skipOnce.has(tab.url)) {
    skipOnce.delete(tab.url);
    return;
  }

  const { interceptEnabled } = await chrome.storage.local.get('interceptEnabled');
  if (interceptEnabled === false) return;

  // Pass the URL in the hash so the viewer doesn't auto-load it.
  // Auto-load triggers a same-origin check that blocks https:// files.
  // translate-overlay.js reads the hash and calls PDFViewerApplication.open() instead.
  const viewerUrl =
    chrome.runtime.getURL('pdfjs/web/viewer.html') +
    '#translate-file=' + encodeURIComponent(tab.url);
  chrome.tabs.update(tabId, { url: viewerUrl });
});

function isPdfUrl(url) {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

// ---------- Messaging ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_IN_CHROME') {
    const url = message.url;
    if (typeof url !== 'string' || !isPdfUrl(url)) return;
    skipOnce.add(url);
    chrome.tabs.update(sender.tab.id, { url });
    return;
  }

  if (message.type === 'TRANSLATE') {
    const word    = typeof message.word    === 'string' ? message.word.slice(0, 200)    : '';
    const context = typeof message.context === 'string' ? message.context.slice(0, 600) : '';
    if (!word) { sendResponse({ error: 'Empty word.' }); return; }

    handleTranslation(word, context)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // keep message channel open for async response
  }
});

// ---------- Translation ----------

async function handleTranslation(word, context) {
  const { apiKey, targetLang } = await chrome.storage.local.get(['apiKey', 'targetLang']);

  if (!apiKey) {
    return { error: 'No API key set — click the extension icon to configure.' };
  }

  const lang = targetLang || 'Ukrainian';

  const prompt = `Analyze the word or phrase "${word}" as used in this context:
"${context || word}"

Return ONLY a JSON object with these exact fields:
{
  "partOfSpeech": "noun | verb | adjective | adverb | preposition | conjunction | pronoun | phrase | other",
  "verbForm": null or one of: "infinitive | present simple | present participle | past simple | past participle",
  "englishExplanation": "1-2 sentence explanation of this specific meaning in context",
  "examples": [
    "example sentence using the same meaning (1)",
    "example sentence using the same meaning (2)",
    "example sentence using the same meaning (3)"
  ],
  "translation": "exact translation to ${lang}",
  "targetExplanation": "one sentence explanation in ${lang}",
  "translatedExample": "translation of examples[0] to ${lang}"
}

verbForm must be JSON null (not the string "null") if partOfSpeech is not verb.
Return only valid JSON, no markdown fences, no extra text.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data   = await response.json();
  const raw    = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty response from API.');

  let card;
  try {
    card = JSON.parse(raw);
  } catch {
    throw new Error('API returned invalid JSON.');
  }

  return { card };
}
