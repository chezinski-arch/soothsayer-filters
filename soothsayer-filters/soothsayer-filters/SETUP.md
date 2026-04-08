# Soothsayer Filters — Setup Guide

## What this repo does
This runs a Python script every day (via GitHub Actions, free cloud automation).
It fetches from EasyList, uBlock Origin, and Peter Lowe's list → builds a fresh
`remote-filters.json` → commits it back to this repo automatically.

Your extension checks this file every 24 hours and updates itself.

---

## Step 1: Create a GitHub account (if you haven't)
Go to https://github.com → Sign up (free)

---

## Step 2: Create this repo on GitHub
1. Log in to GitHub
2. Click the **+** button (top right) → **New repository**
3. Name it exactly: `soothsayer-filters`
4. Set it to **Public** (required — the extension fetches the raw file)
5. Click **Create repository**

---

## Step 3: Upload these files
You'll see a page with upload options after creating the repo.

Upload ALL files from the `soothsayer-filters` folder you downloaded:
  - `update_filters.py`
  - `remote-filters.json` (the starting version)
  - `.github/workflows/daily-update.yml`

To upload the workflow file, you'll need to create the folder structure manually
on GitHub:
  1. Click **Add file → Create new file**
  2. In the filename box type: `.github/workflows/daily-update.yml`
  3. Paste the content of `daily-update.yml`
  4. Click **Commit new file**

Then upload `update_filters.py` and `remote-filters.json` via **Add file → Upload files**.

---

## Step 4: Enable GitHub Actions
1. In your repo, click the **Actions** tab
2. If prompted, click **"I understand my workflows, go ahead and enable them"**
3. You should see "Daily Filter Update" listed

---

## Step 5: Run it manually the first time
1. Click **Actions → Daily Filter Update**
2. Click **Run workflow → Run workflow**
3. Watch it run (takes ~30 seconds)
4. After it finishes, check that `remote-filters.json` was updated

---

## Step 6: Connect your extension to this repo
Get your raw file URL:
```
https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/soothsayer-filters/main/remote-filters.json
```
Replace `YOUR_GITHUB_USERNAME` with your actual username.

Then open `soothsayer-adblocker/background.js` and update line 8:
```js
const REMOTE_FILTER_URL = 'https://raw.githubusercontent.com/YOUR_USERNAME/soothsayer-filters/main/remote-filters.json';
```

Reload the extension in Chrome (chrome://extensions → click the refresh icon).

---

## How to update filters manually (anytime)
1. Go to your repo on GitHub
2. Click **Actions → Daily Filter Update → Run workflow**
3. Done — your extension will pick it up within 24 hours

---

## Automatic schedule
GitHub Actions runs at 3:00 AM UTC every day automatically.
No computer needs to be on. It's running in GitHub's cloud.

---

## How to know it's working
- Check the **Actions** tab — each run shows green ✓ or red ✗
- Click any run to see the full log output
- The `remote-filters.json` commit history shows daily updates

---

## Troubleshooting
| Problem | Fix |
|---|---|
| Actions tab shows red ✗ | Click the run → read the error log |
| Extension still shows "bundled filters" | Check you put the correct URL in background.js |
| Raw URL returns 404 | Make sure repo is Public, not Private |
| No commits after running | Filters were identical — this is normal, means nothing changed |
