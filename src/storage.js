// Settings and per-sprint team adjustments, stored locally in the browser.

export async function loadSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return settings || {};
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set({ settings });
}

export async function loadMembers(boardId, sprintId) {
  const key = `members:${location.host}:${boardId}:${sprintId}`;
  const stored = await chrome.storage.local.get(key);
  return stored[key] || [];
}

export async function saveMembers(boardId, sprintId, members) {
  const key = `members:${location.host}:${boardId}:${sprintId}`;
  await chrome.storage.local.set({ [key]: members });
}
