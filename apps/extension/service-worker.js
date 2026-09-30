/**
 * JobHunt OS — Chrome Extension Manifest V3 Background Service Worker
 * Handles local Fastify API gateway communication (:4000) and LinkedIn session sync.
 */

const API_BASE_URL = 'http://127.0.0.1:4000';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[JobHunt OS] Extension installed and background worker active.');
  checkApiHealth();
});

async function checkApiHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    const data = await res.json();
    if (data.status === 'ok') {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
      return true;
    }
  } catch (err) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    return false;
  }
  return false;
}

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const data = await chrome.storage.local.get(['apiKey']);
    if (data?.apiKey) {
      headers['x-api-key'] = data.apiKey;
    }
  } catch (err) {
    // storage not available or empty
  }
  return headers;
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CHECK_HEALTH') {
    checkApiHealth().then((ok) => sendResponse({ ok, baseUrl: API_BASE_URL }));
    return true;
  }

  if (request.action === 'INGEST_JOBS') {
    const { jobs, source = 'linkedin' } = request;
    getHeaders().then((headers) => {
      fetch(`${API_BASE_URL}/jobs/ingest-batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source, jobs }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log('[JobHunt OS] Ingested batch result:', data);
          sendResponse({ success: true, data });
        })
        .catch((err) => {
          console.error('[JobHunt OS] Ingest failed:', err);
          sendResponse({ success: false, error: err.message });
        });
    });
    return true;
  }

  if (request.action === 'GET_CANDIDATE_PROFILE') {
    getHeaders().then((headers) => {
      fetch(`${API_BASE_URL}/profile`, { headers })
        .then((res) => res.json())
        .then((data) => sendResponse({ success: true, profile: data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (request.action === 'GET_COOKIES') {
    chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' }, (cookie) => {
      sendResponse({ li_at: cookie?.value || null });
    });
    return true;
  }
});
