// Soothsayer AdBlocker — Background Service Worker v2
// Features: stats tracking, enable/disable, and 24-hour remote filter auto-update

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// IMPORTANT: Replace this URL with your own GitHub raw URL after you publish
// the remote-filters.json file to your repo.
// Example: https://raw.githubusercontent.com/YOUR_USERNAME/soothsayer-filters/main/remote-filters.json
const REMOTE_FILTER_URL = 'https://raw.githubusercontent.com/YOUR_USERNAME/soothsayer-filters/main/remote-filters.json';

// Dynamic rule IDs start at 1000 to avoid collision with bundled rules.json (IDs 1–40)
const DYNAMIC_RULE_ID_START = 1000;

// ─── INSTALL ──────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    enabled: true,
    blockedCount: 0,
    youtubeSkipEnabled: true,
    generalBlockEnabled: true,
    filtersVersion: null,
    filtersLastUpdated: null
  });

  console.log('[Soothsayer] Installed. Fetching remote filters...');
  fetchRemoteFilters();
});

// ─── ALARMS: run filter update every 24 hours ─────────────────────────────────
chrome.alarms.create('filterUpdate', { periodInMinutes: 1440 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'filterUpdate') {
    console.log('[Soothsayer] 24h alarm — checking for filter updates...');
    fetchRemoteFilters();
  }
});

// ─── REMOTE FILTER FETCH ──────────────────────────────────────────────────────
async function fetchRemoteFilters() {
  // Skip if user hasn't configured a URL yet
  if (REMOTE_FILTER_URL.includes('YOUR_USERNAME')) {
    console.warn('[Soothsayer] Remote filter URL not configured yet. Using bundled rules only.');
    return;
  }

  try {
    const response = await fetch(REMOTE_FILTER_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const filters = await response.json();
    console.log(`[Soothsayer] Fetched remote filters v${filters.version}`);

    // Check if we already have this version
    const stored = await chrome.storage.local.get(['filtersVersion']);
    if (stored.filtersVersion === filters.version) {
      console.log('[Soothsayer] Filters already up to date.');
      return;
    }

    // Apply new dynamic network blocking rules
    if (filters.blockDomains && filters.blockDomains.length > 0) {
      await applyDynamicBlockRules(filters.blockDomains);
    }

    // Store updated selectors for content scripts to use
    await chrome.storage.local.set({
      filtersVersion: filters.version,
      filtersLastUpdated: new Date().toISOString(),
      remoteYoutubeSelectors: filters.youtubeSelectors || null,
      remoteGeneralSelectors: filters.generalSelectors || null
    });

    console.log(`[Soothsayer] Filters updated to v${filters.version}`);
  } catch (err) {
    console.warn('[Soothsayer] Could not fetch remote filters:', err.message);
    // Gracefully fall back — bundled rules still active
  }
}

// ─── DYNAMIC RULE APPLICATION ─────────────────────────────────────────────────
async function applyDynamicBlockRules(domains) {
  // Remove all existing dynamic rules first
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existing.map(r => r.id);

  // Build new rules from domain list
  const newRules = domains.map((domain, index) => ({
    id: DYNAMIC_RULE_ID_START + index,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'media']
    }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: newRules
  });

  console.log(`[Soothsayer] Applied ${newRules.length} dynamic block rules.`);
}

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'GET_STATS') {
    chrome.storage.local.get(
      ['blockedCount', 'enabled', 'filtersVersion', 'filtersLastUpdated'],
      (data) => {
        sendResponse({
          blockedCount: data.blockedCount || 0,
          enabled: data.enabled !== false,
          filtersVersion: data.filtersVersion || 'bundled',
          filtersLastUpdated: data.filtersLastUpdated || null
        });
      }
    );
    return true;
  }

  if (message.type === 'SET_ENABLED') {
    const enabled = message.enabled;
    chrome.storage.local.set({ enabled });
    chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds:  enabled ? ['block_ads'] : [],
      disableRulesetIds: enabled ? [] : ['block_ads']
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'AD_BLOCKED') {
    chrome.storage.local.get(['blockedCount'], (data) => {
      chrome.storage.local.set({ blockedCount: (data.blockedCount || 0) + (message.count || 1) });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'RESET_COUNT') {
    chrome.storage.local.set({ blockedCount: 0 });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'FORCE_UPDATE') {
    fetchRemoteFilters().then(() => sendResponse({ success: true }));
    return true;
  }
});
