// Soothsayer AdBlocker — Popup Script v2

document.addEventListener('DOMContentLoaded', () => {
  const mainToggle    = document.getElementById('mainToggle');
  const youtubeToggle = document.getElementById('youtubeToggle');
  const generalToggle = document.getElementById('generalToggle');
  const blockedCount  = document.getElementById('blockedCount');
  const resetBtn      = document.getElementById('resetBtn');
  const statusDot     = document.getElementById('statusDot');
  const statusText    = document.getElementById('statusText');
  const filterVersion = document.getElementById('filterVersion');
  const updateBtn     = document.getElementById('updateBtn');

  // Load current state
  chrome.storage.local.get(
    ['enabled', 'blockedCount', 'youtubeSkipEnabled', 'generalBlockEnabled',
     'filtersVersion', 'filtersLastUpdated'],
    (data) => {
      const enabled = data.enabled !== false;
      mainToggle.checked    = enabled;
      youtubeToggle.checked = data.youtubeSkipEnabled !== false;
      generalToggle.checked = data.generalBlockEnabled !== false;
      blockedCount.textContent = formatCount(data.blockedCount || 0);
      updateStatus(enabled);
      updateFilterInfo(data.filtersVersion, data.filtersLastUpdated);
    }
  );

  // Main toggle
  mainToggle.addEventListener('change', () => {
    const enabled = mainToggle.checked;
    chrome.runtime.sendMessage({ type: 'SET_ENABLED', enabled }, () => {
      updateStatus(enabled);
    });
  });

  // YouTube toggle
  youtubeToggle.addEventListener('change', () => {
    chrome.storage.local.set({ youtubeSkipEnabled: youtubeToggle.checked });
  });

  // General toggle
  generalToggle.addEventListener('change', () => {
    chrome.storage.local.set({ generalBlockEnabled: generalToggle.checked });
  });

  // Reset count
  resetBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'RESET_COUNT' }, () => {
      blockedCount.textContent = '0';
    });
  });

  // Force filter update
  updateBtn.addEventListener('click', () => {
    updateBtn.textContent = 'Checking...';
    updateBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'FORCE_UPDATE' }, () => {
      chrome.storage.local.get(['filtersVersion', 'filtersLastUpdated'], (data) => {
        updateFilterInfo(data.filtersVersion, data.filtersLastUpdated);
        updateBtn.textContent = 'Check Now';
        updateBtn.disabled = false;
      });
    });
  });

  // Auto-refresh count every second
  setInterval(() => {
    chrome.storage.local.get(['blockedCount'], (data) => {
      blockedCount.textContent = formatCount(data.blockedCount || 0);
    });
  }, 1000);

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  function updateStatus(enabled) {
    if (enabled) {
      statusDot.classList.remove('off');
      statusText.textContent = 'Active & blocking';
    } else {
      statusDot.classList.add('off');
      statusText.textContent = 'Paused';
    }
  }

  function updateFilterInfo(version, lastUpdated) {
    if (!filterVersion) return;
    if (version && version !== 'bundled') {
      const date = lastUpdated ? new Date(lastUpdated).toLocaleDateString() : '—';
      filterVersion.textContent = `Filters v${version} · Updated ${date}`;
    } else {
      filterVersion.textContent = 'Bundled filters (set GitHub URL to enable auto-updates)';
    }
  }

  function formatCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }
});
