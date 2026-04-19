const apiKeyInput       = document.getElementById('apiKey');
const targetLangSelect  = document.getElementById('targetLang');
const interceptCheckbox = document.getElementById('interceptEnabled');
const saveBtn           = document.getElementById('save');
const statusEl          = document.getElementById('status');

chrome.storage.local.get(['apiKey', 'targetLang', 'interceptEnabled'], ({ apiKey, targetLang, interceptEnabled }) => {
  if (apiKey)     apiKeyInput.value      = apiKey;
  if (targetLang) targetLangSelect.value = targetLang;
  interceptCheckbox.checked = interceptEnabled !== false; // default on
});

saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({
    apiKey:           apiKeyInput.value.trim(),
    targetLang:       targetLangSelect.value,
    interceptEnabled: interceptCheckbox.checked,
  }, () => {
    statusEl.textContent = 'Saved!';
    setTimeout(() => (statusEl.textContent = ''), 2000);
  });
});
