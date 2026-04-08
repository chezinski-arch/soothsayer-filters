// Soothsayer AdBlocker — General Content Script v2
// Loads selectors from chrome.storage; falls back to bundled list

(function () {
  'use strict';

  const DEFAULT_SELECTORS = [
    '[id*="google_ads_iframe"]', '[id*="google_ads_frame"]',
    '[id^="div-gpt-ad"]', '[id^="dfp-ad-"]', '[id^="ad-slot-"]',
    '[class*="ad-container"]', '[class*="ads-container"]',
    '[class*="ad-banner"]', '[class*="adunit"]', '[class*="ad-unit"]',
    '[class*="ad-wrapper"]', '[class*="sponsored-content"]',
    '[class*="promo-ad"]', '[class*="promoted"]',
    'ins.adsbygoogle', '.adsbygoogle',
    'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googleadservices.com"]', 'iframe[src*="adnxs.com"]',
    'iframe[src*="taboola.com"]', 'iframe[src*="outbrain.com"]',
    'iframe[src*="moatads.com"]', 'iframe[src*="criteo.com"]',
    'div[id*="taboola"]', 'div[id*="outbrain"]',
    '.taboola-widget', '.outbrain-widget', '.OUTBRAIN',
    '#taboola-below-article-thumbnails', '#outbrain_widget',
    '[data-testid*="ad"]', '[data-ad-loaded]',
    '[aria-label="Ad"]', '[aria-label="Ads"]', '[aria-label="Sponsored"]',
    '.promotedlink', '[data-promoted="true"]',
    '.sticky-ad', '#sticky-ad', '.fixed-ad', '.ad-sticky', '.ad-fixed'
  ];

  let activeSelectors = [...DEFAULT_SELECTORS];
  let isEnabled = true;

  chrome.storage.local.get(
    ['enabled', 'generalBlockEnabled', 'remoteGeneralSelectors'],
    (data) => {
      if (data.enabled === false || data.generalBlockEnabled === false) return;

      if (data.remoteGeneralSelectors && Array.isArray(data.remoteGeneralSelectors)) {
        // Merge: combine defaults + remote (deduplicated)
        activeSelectors = [...new Set([...DEFAULT_SELECTORS, ...data.remoteGeneralSelectors])];
      }

      init();
    }
  );

  // Live update when background fetches new filters
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.remoteGeneralSelectors?.newValue) {
      activeSelectors = [...new Set([...DEFAULT_SELECTORS, ...changes.remoteGeneralSelectors.newValue])];
    }
    if (changes.enabled !== undefined) isEnabled = changes.enabled.newValue !== false;
    if (changes.generalBlockEnabled !== undefined) isEnabled = changes.generalBlockEnabled.newValue !== false;
  });

  function init() {
    hideAdElements();
    const observer = new MutationObserver(() => hideAdElements());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function hideAdElements() {
    if (!isEnabled) return;
    let hidden = 0;
    activeSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (el.style.display !== 'none') {
            el.style.setProperty('display', 'none', 'important');
            hidden++;
          }
        });
      } catch (e) { /* invalid selector on this page — skip */ }
    });

    if (hidden > 0) {
      try {
        chrome.runtime.sendMessage({ type: 'AD_BLOCKED', count: hidden }, () => {
          if (chrome.runtime.lastError) { /* suppress */ }
        });
      } catch (e) { /* context invalidated */ }
    }
  }

})();
