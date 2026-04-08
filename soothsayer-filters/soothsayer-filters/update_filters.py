#!/usr/bin/env python3
"""
Soothsayer AdBlocker — Daily Filter Updater
============================================
Fetches from community-maintained filter lists (EasyList, uBlock Origin,
Peter Lowe's list) and regenerates remote-filters.json automatically.

Sources used:
  - Peter Lowe's Ad Server List  (plain domain list, very reliable)
  - EasyList                     (largest ABP-format ad filter list)
  - uBlock Origin Filters        (YouTube-specific element selectors)
  - uBlock Origin Annoyances     (extra element hiders)
"""

import json
import re
import sys
import hashlib
import urllib.request
import urllib.error
from datetime import datetime, timezone

# ─── CONFIGURATION ─────────────────────────────────────────────────────────────

OUTPUT_FILE = "remote-filters.json"

# Max dynamic rules Chrome allows (safety buffer below 5000 limit)
MAX_DOMAINS = 3000

# Filter list sources
SOURCES = {
    "peter_lowe": {
        "url": "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=plain&showintro=0&mimetype=plaintext",
        "format": "plain_domains",
        "description": "Peter Lowe's Ad Server List"
    },
    "easylist": {
        "url": "https://easylist.to/easylist/easylist.txt",
        "format": "abp",
        "description": "EasyList"
    },
    "ublock_filters": {
        "url": "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
        "format": "abp",
        "description": "uBlock Origin Filters"
    },
    "ublock_annoyances": {
        "url": "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt",
        "format": "abp",
        "description": "uBlock Origin Annoyances"
    }
}

# Domains that are always safe to keep even if not in fetched lists
ALWAYS_BLOCK_DOMAINS = [
    "doubleclick.net", "googlesyndication.com", "googleadservices.com",
    "adservice.google.com", "amazon-adsystem.com", "ads.twitter.com",
    "adnxs.com", "taboola.com", "outbrain.com", "moatads.com",
    "adsafeprotected.com", "media.net", "openx.net", "rubiconproject.com",
    "pubmatic.com", "criteo.com", "scorecardresearch.com", "quantserve.com",
    "ads.linkedin.com", "advertising.com", "pubads.g.doubleclick.net",
    "securepubads.g.doubleclick.net", "smartadserver.com", "serving-sys.com",
    "yieldmanager.com", "contextweb.com", "bidswitch.net", "mathtag.com",
    "ad.adsrvr.org", "trafficjunky.net", "adform.net", "appnexus.com",
    "lijit.com", "sovrn.com", "sharethrough.com", "indexexchange.com",
    "triplelift.com", "springserve.com", "33across.com", "spotxchange.com",
    "teads.tv", "yieldmo.com", "undertone.com", "conversantmedia.com",
    "casalemedia.com", "rhythmone.com", "districtm.io", "adskeeper.co.uk"
]

# YouTube-specific selectors — curated baseline that gets merged with fetched ones
YOUTUBE_SELECTORS_BASELINE = {
    "skipButtons": [
        ".ytp-skip-ad-button",
        ".ytp-ad-skip-button",
        ".ytp-ad-skip-button-container button",
        "button.ytp-skip-ad-button",
        ".videoAdUiSkipButton",
        "[class*='skip-button']"
    ],
    "adPlaying": [
        ".ad-showing",
        ".ytp-ad-player-overlay",
        "[class*='ad-showing']",
        ".ytp-ad-module"
    ],
    "overlayAds": [
        ".ytp-ad-overlay-container",
        ".ytp-ad-text-overlay",
        ".ytp-ad-image-overlay",
        ".ytp-ce-element",
        ".ytp-suggested-action",
        ".ytp-ad-overlay-close-button",
        ".ytp-ad-overlay-slot"
    ],
    "bannerAds": [
        "#masthead-ad",
        "ytd-display-ad-renderer",
        "ytd-promoted-sparkles-web-renderer",
        "ytd-promoted-video-renderer",
        "ytd-compact-promoted-video-renderer",
        "ytd-ad-slot-renderer",
        "ytd-in-feed-ad-layout-renderer",
        "#player-ads",
        ".ytd-promoted-sparkles-text-search-renderer",
        "ytd-banner-promo-renderer",
        "ytd-statement-banner-renderer",
        "ytd-primetime-promo-renderer",
        "ytd-mealbar-promo-renderer",
        "ytd-search-pyv-renderer",
        "ytd-action-companion-ad-renderer",
        "ytd-video-masthead-ad-v3-renderer",
        "ytd-companion-slot-renderer",
        "#ad-badge",
        ".yt-mealbar-promo-renderer",
        "ytm-companion-ad-renderer",
        "ytm-promoted-sparkles-renderer"
    ]
}


# ─── FETCHING ──────────────────────────────────────────────────────────────────

def fetch_url(url, name, timeout=20):
    """Fetch URL content as text. Returns None on failure."""
    print(f"  Fetching {name}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SoothsayerAdBlocker/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
            print(f"  ✓ {name}: {len(content):,} chars")
            return content
    except Exception as e:
        print(f"  ✗ {name} failed: {e}")
        return None


# ─── PARSING ───────────────────────────────────────────────────────────────────

def parse_plain_domains(text):
    """Parse a plain one-domain-per-line file."""
    domains = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Validate it looks like a domain
        if is_valid_domain(line):
            domains.add(line.lower())
    return domains


def parse_abp_format(text):
    """
    Parse ABP/EasyList format.
    Returns: (block_domains: set, youtube_selectors: list)
    """
    block_domains = set()
    youtube_selectors = []

    for line in text.splitlines():
        line = line.strip()

        # Skip comments and metadata
        if not line or line.startswith("!") or line.startswith("["):
            continue

        # Domain block rules: ||domain.com^
        domain_match = re.match(r'^\|\|([a-zA-Z0-9._-]+)\^(\$.*)?$', line)
        if domain_match:
            domain = domain_match.group(1).lower()
            # Skip if it has subpath modifiers that indicate it's not a pure domain block
            suffix = domain_match.group(2) or ""
            if "third-party" in suffix or "script" in suffix or not "domain" in suffix or suffix == "":
                if is_valid_domain(domain):
                    block_domains.add(domain)
            continue

        # YouTube element hiding: youtube.com##selector
        yt_hide_match = re.match(r'^(?:[^#]*youtube\.com[^#]*)##(.+)$', line)
        if yt_hide_match:
            selector = yt_hide_match.group(1).strip()
            # Filter out extended CSS selectors (not standard CSS, won't work in content scripts)
            if any(op in selector for op in [":has(", ":not-has(", ":matches-css", ":upward", ":xpath"]):
                continue
            # Only keep selectors that look ad-related (contain known ad keywords)
            sel_lower = selector.lower()
            ad_keywords = [
                "ad", "ads", "adv", "sponsor", "promo", "promoted",
                "banner", "masthead", "companion", "pyv", "mealbar",
                "skip", "overlay"
            ]
            if any(kw in sel_lower for kw in ad_keywords):
                youtube_selectors.append(selector)

    return block_domains, youtube_selectors


def is_valid_domain(s):
    """Rough check that s looks like a valid domain, not a URL or IP."""
    if not s or len(s) > 253:
        return False
    if "/" in s or ":" in s or " " in s:
        return False
    # Must have at least one dot
    if "." not in s:
        return False
    # Basic domain pattern (alphanumeric + dots + hyphens only)
    if not re.match(r'^[a-zA-Z0-9._-]+$', s):
        return False
    # Exclude IP addresses (e.g. 192.168.1.1)
    if re.match(r'^\d+\.\d+\.\d+\.\d+$', s):
        return False
    # Don't block CDNs or known-good domains (check by suffix, catches subdomains too)
    safe_suffixes = [
        "google.com", "googleapis.com", "gstatic.com", "youtube.com",
        "ytimg.com", "cloudflare.com", "fastly.net", "akamai.net",
        "cloudfront.net", "amazonaws.com", "microsoft.com", "apple.com",
        "w3.org", "mozilla.org", "wikipedia.org"
    ]
    for safe in safe_suffixes:
        if s == safe or s.endswith("." + safe):
            return False
    return True


def categorize_youtube_selectors(raw_selectors):
    """
    Take a flat list of YouTube CSS selectors from filter lists
    and attempt to categorize them into our structure.
    """
    skip_patterns = ["skip", "Skip"]
    overlay_patterns = ["overlay", "text-overlay", "image-overlay", "ce-element", "suggested-action"]
    banner_patterns = [
        "masthead-ad", "display-ad", "promoted", "banner", "promo",
        "in-feed-ad", "player-ads", "search-pyv", "statement-banner",
        "primetime", "mealbar", "companion", "ad-badge", "ad-slot"
    ]

    extra_skip = []
    extra_overlay = []
    extra_banner = []

    for sel in raw_selectors:
        sel_lower = sel.lower()
        if any(p.lower() in sel_lower for p in skip_patterns):
            extra_skip.append(sel)
        elif any(p in sel_lower for p in overlay_patterns):
            extra_overlay.append(sel)
        elif any(p in sel_lower for p in banner_patterns):
            extra_banner.append(sel)
        else:
            # Generic ad element — goes to banner/general bucket
            if "ad" in sel_lower:
                extra_banner.append(sel)

    return extra_skip, extra_overlay, extra_banner


# ─── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    print("\n🔮 Soothsayer Filter Updater")
    print("=" * 40)

    all_domains = set(ALWAYS_BLOCK_DOMAINS)
    all_yt_selectors_raw = []
    any_source_succeeded = False

    # ── Fetch and parse all sources ──
    for key, source in SOURCES.items():
        print(f"\n[{source['description']}]")
        content = fetch_url(source["url"], source["description"])
        if content is None:
            print(f"  Skipping {source['description']} — will use cached/bundled data.")
            continue

        any_source_succeeded = True

        if source["format"] == "plain_domains":
            domains = parse_plain_domains(content)
            print(f"  Parsed {len(domains):,} domains")
            all_domains.update(domains)

        elif source["format"] == "abp":
            domains, yt_selectors = parse_abp_format(content)
            print(f"  Parsed {len(domains):,} block domains, {len(yt_selectors)} YouTube selectors")
            all_domains.update(domains)
            all_yt_selectors_raw.extend(yt_selectors)

    if not any_source_succeeded:
        print("\n✗ All sources failed. Aborting — keeping existing remote-filters.json.")
        sys.exit(1)

    # ── Clean and cap domain list ──
    clean_domains = sorted([d for d in all_domains if is_valid_domain(d)])
    if len(clean_domains) > MAX_DOMAINS:
        # Prioritize ALWAYS_BLOCK_DOMAINS, then fill with the rest
        priority = [d for d in clean_domains if d in ALWAYS_BLOCK_DOMAINS]
        rest = [d for d in clean_domains if d not in ALWAYS_BLOCK_DOMAINS]
        clean_domains = priority + rest[:MAX_DOMAINS - len(priority)]

    print(f"\n✓ Total unique block domains: {len(clean_domains):,}")

    # ── Merge YouTube selectors ──
    extra_skip, extra_overlay, extra_banner = categorize_youtube_selectors(all_yt_selectors_raw)

    def merge_unique(base, extra):
        return list(dict.fromkeys(base + [s for s in extra if s not in base]))

    youtube_selectors = {
        "skipButtons": merge_unique(YOUTUBE_SELECTORS_BASELINE["skipButtons"], extra_skip),
        "adPlaying":   YOUTUBE_SELECTORS_BASELINE["adPlaying"],
        "overlayAds":  merge_unique(YOUTUBE_SELECTORS_BASELINE["overlayAds"], extra_overlay),
        "bannerAds":   merge_unique(YOUTUBE_SELECTORS_BASELINE["bannerAds"], extra_banner)
    }

    skip_count    = len(youtube_selectors["skipButtons"])
    overlay_count = len(youtube_selectors["overlayAds"])
    banner_count  = len(youtube_selectors["bannerAds"])
    print(f"✓ YouTube selectors: {skip_count} skip, {overlay_count} overlay, {banner_count} banner")

    # ── Build output ──
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    output = {
        "_readme": "Auto-generated daily by Soothsayer filter updater. Do not edit manually.",
        "version": today,
        "updated": today,
        "blockDomains": clean_domains,
        "youtubeSelectors": youtube_selectors,
        "generalSelectors": [
            "[id*=\"google_ads_iframe\"]",
            "[id*=\"google_ads_frame\"]",
            "[id^=\"div-gpt-ad\"]",
            "[id^=\"dfp-ad-\"]",
            "ins.adsbygoogle",
            ".adsbygoogle",
            "div[id*=\"taboola\"]",
            "div[id*=\"outbrain\"]",
            ".OUTBRAIN",
            "[aria-label=\"Sponsored\"]",
            "[data-promoted=\"true\"]",
            "[class*=\"sponsored-content\"]",
            "[class*=\"promo-ad\"]"
        ]
    }

    # ── Check if content actually changed ──
    new_json = json.dumps(output, indent=2)

    try:
        with open(OUTPUT_FILE, "r") as f:
            existing = f.read()
        existing_hash = hashlib.md5(existing.encode()).hexdigest()
        new_hash = hashlib.md5(new_json.encode()).hexdigest()

        if existing_hash == new_hash:
            print(f"\n✓ No changes detected. remote-filters.json is already up to date.")
            return
    except FileNotFoundError:
        pass  # First run

    # ── Write output ──
    with open(OUTPUT_FILE, "w") as f:
        f.write(new_json)

    print(f"\n✅ remote-filters.json updated → version {today}")
    print(f"   {len(clean_domains):,} block domains")
    print(f"   {skip_count + overlay_count + banner_count} YouTube selectors")


if __name__ == "__main__":
    main()
