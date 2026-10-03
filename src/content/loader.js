// Content scripts can't be ES modules directly, so load the real entry point dynamically.
import(chrome.runtime.getURL('src/content/main.js')).catch((err) =>
  console.error('[Capacity forecast] failed to load', err),
);
