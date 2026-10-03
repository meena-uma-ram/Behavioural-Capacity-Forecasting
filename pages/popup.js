document.getElementById('demo').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('demo/demo.html') });
});
document.getElementById('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
