// Soothsayer AdBlocker — YouTube Content Script v2
// Loads selectors from chrome.storage (updated by remote filter engine)
// Falls back to bundled selectors if no remote update has occurred yet

(function () {
  'use strict';

  // ─── BUNDLED FALLBACK SELECTORS ─────────────────────────────────────────────
  const DEFAULTS = {
    skipButtons: [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-container button',
      'button.ytp-skip-ad-button'
    ],
    adPlaying: [
      '.ad-showing',
      '.ytp-ad-player-overlay',
      '[class*="ad-showing"]'
    ],
    overlayAds: [
      '.ytp-ad-overlay-container',
      '.ytp-ad-text-overlay',
      '.ytp-ad-image-overlay',
      '.ytp-ce-element',
      '.ytp-suggested-action',
      '.ytp-ad-overlay-close-button'
    ],
    bannerAds: [
      '#masthead-ad',
      'ytd-display-ad-renderer',
      'ytd-promoted-sparkles-web-renderer',
      'ytd-promoted-video-renderer',
      'ytd-compact-promoted-video-renderer',
      'ytd-ad-slot-renderer',
      'ytd-in-feed-ad-layout-renderer',
      '#player-ads',
      '.ytd-promoted-sparkles-text-search-renderer',
      'ytd-banner-promo-renderer',
      'ytd-statement-banner-renderer',
      'ytd-primetime-promo-renderer',
      'ytd-mealbar-promo-renderer',
      'ytd-search-pyv-renderer'
    ]
  };

  // Active selectors (defaults until remote update loads)
  let selectors = { ...DEFAULTS };
  let isEnabled = true;

  // ─── INIT ───────────────────────────────────────────────────────────────────
  chrome.storage.local.get(
    ['enabled', 'youtubeSkipEnabled', 'remoteYoutubeSelectors'],
    (data) => {
      isEnabled = data.enabled !== false && data.youtubeSkipEnabled !== false;

      // Merge remote selectors with defaults (remote takes priority)
      if (data.remoteYoutubeSelectors) {
        selectors = mergeSelectors(DEFAULTS, data.remoteYoutubeSelectors);
        console.log('[Soothsayer] Using remote YouTube selectors.');
      }

      if (isEnabled) init();
    }
  );

  // Listen for storage updates (when background fetches new filters mid-session)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.remoteYoutubeSelectors?.newValue) {
      selectors = mergeSelectors(DEFAULTS, changes.remoteYoutubeSelectors.newValue);
      console.log('[Soothsayer] YouTube selectors updated live from remote filters.');
    }
    if (changes.enabled !== undefined) {
      isEnabled = changes.enabled.newValue !== false;
    }
    if (changes.youtubeSkipEnabled !== undefined) {
      isEnabled = changes.youtubeSkipEnabled.newValue !== false;
    }
  });

  // ─── CORE ───────────────────────────────────────────────────────────────────
  function init() {
    startObserver();
    setInterval(runAdLogic, 400);
  }

  function runAdLogic() {
    if (!isEnabled) return;
    skipVideoAd();
    hideOverlayAds();
    hideBannerAds();
  }

  function skipVideoAd() {
    // Method 1: Click skip button
    for (const sel of selectors.skipButtons) {
      const skipBtn = document.querySelector(sel);
      if (skipBtn && skipBtn.offsetParent !== null) {
        skipBtn.click();
        reportBlocked(1);
        return;
      }
    }

    // Method 2: Advance video to end if ad is playing
    for (const sel of selectors.adPlaying) {
      const adEl = document.querySelector(sel);
      if (adEl) {
        const video = document.querySelector('video');
        if (video && !isNaN(video.duration) && video.duration > 0) {
          video.currentTime = video.duration;
          reportBlocked(1);
        }
        return;
      }
    }
  }

  function hideOverlayAds() {
    let hidden = 0;
    selectors.overlayAds.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el.style.display !== 'none') {
          el.style.setProperty('display', 'none', 'important');
          hidden++;
        }
      });
    });
    if (hidden > 0) reportBlocked(hidden);
  }

  function hideBannerAds() {
    let hidden = 0;
    selectors.bannerAds.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el.style.display !== 'none') {
          el.style.setProperty('display', 'none', 'important');
          hidden++;
        }
      });
    });
    if (hidden > 0) reportBlocked(hidden);
  }

  // ─── OBSERVER ───────────────────────────────────────────────────────────────
  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(m => m.addedNodes.length > 0)) {
        runAdLogic();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ─── UTILITIES ──────────────────────────────────────────────────────────────
  function mergeSelectors(defaults, remote) {
    // Remote selectors are merged on top of defaults
    // If remote has a key, it REPLACES (not appends) the default for that key
    // This way remote can add new selectors OR remove broken ones
    return {
      skipButtons: remote.skipButtons || defaults.skipButtons,
      adPlaying:   remote.adPlaying   || defaults.adPlaying,
      overlayAds:  remote.overlayAds  || defaults.overlayAds,
      bannerAds:   remote.bannerAds   || defaults.bannerAds
    };
  }

  function reportBlocked(count) {
    try {
      chrome.runtime.sendMessage({ type: 'AD_BLOCKED', count }, () => {
        if (chrome.runtime.lastError) { /* suppress */ }
      });
    } catch (e) { /* context invalidated */ }
  }

})();
