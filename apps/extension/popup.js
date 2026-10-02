/**
 * JobHunt OS — Extension Popup Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusPill = document.getElementById('backend-status');
  const syncBtn = document.getElementById('btn-sync-active');
  const openConsoleBtn = document.getElementById('btn-open-console');

  // Check health of local Fastify backend
  chrome.runtime.sendMessage({ action: 'CHECK_HEALTH' }, (res) => {
    if (res?.ok) {
      statusPill.textContent = 'ONLINE (:4000)';
      statusPill.style.color = '#10B981';
      statusPill.style.background = 'rgba(16, 185, 129, 0.15)';
    } else {
      statusPill.textContent = 'OFFLINE';
      statusPill.style.color = '#EF4444';
      statusPill.style.background = 'rgba(239, 68, 68, 0.15)';
    }
  });

  // Open Full Web Console in a new tab
  openConsoleBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:3000' });
  });

  // Sync Jobs on Active LinkedIn Tab
  syncBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          document.getElementById('jh-sync-btn')?.click();
        },
      });
      window.close();
    }
  });
});
