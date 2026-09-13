# Theatre

A single-screen theatre tracker. Shows, tickets, expenses, and what they add up to.
Everything is stored on the phone. No server, no login, no internet needed to use it.

---

## Getting it onto your phone

You need two free accounts: **GitHub** and **Expo**. No card, no payment.

### 1. Put the code on GitHub

- Go to **github.com** → New repository → name it `theatre-tracker` → **Private** → Create
- On the empty repo page, click **uploading an existing file**
- Drag in everything from this folder — the files *and* the `src` and `.github` folders
- Scroll down, click **Commit changes**

### 2. Link it to Expo

- Go to **expo.dev** → sign up → **Create a project** → name it `theatre-tracker`
- Expo shows you a **Project ID**. Copy it.
- Back in GitHub, open `app.json`, click the pencil icon, and paste the ID between the empty
  quotes on the `"projectId": ""` line. Commit.

### 3. Give GitHub permission to build

- On expo.dev: your avatar → **Access tokens** → **Create token** → copy it
- On GitHub: repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
- Name it exactly `EXPO_TOKEN`, paste the token, save

### 4. Build

- GitHub → **Actions** tab → **Build APK** → **Run workflow**
- About 15 minutes later the APK appears on expo.dev under **Builds**
- Open that page on your phone, download, install
- Android will warn about installing outside the Play Store. That is expected — allow it.

**If the first build fails**, open the build log on expo.dev and send the red error text.
A version mismatch on the first build is normal and takes one commit to fix.

---

## First five minutes in the app

1. **Settings** → set your ticket classes: names, seat counts, usual prices
2. **Settings** → trim the expense categories to the ones you actually use
3. **Film** → set the film that's playing now
4. **Today** → tap a slot, enter tickets, save

Prices are remembered, so after the first show you only type ticket counts.

### Film search

Nothing to set up. Type two letters of a film name in the **Film** tab and it searches
Wikipedia for the poster and release year.

Old and re-released films are well covered. If something doesn't appear — a small regional
film with no article, or the phone is offline — type the name and start the run anyway.
Everything except the poster and release year works the same.

---

## Backup

**This is the one habit that matters.** The data exists on one phone and nowhere else.

**Settings → Back up and send** writes a single file and opens the share sheet. Send it to
yourself on WhatsApp. Do it weekly. Settings turns red if it's been more than seven days.

To recover: install the app, **Settings → Restore**, pick the file from your WhatsApp downloads.

Restore **replaces** everything rather than merging, because merging quietly creates duplicate
shows and you would only notice months later when the totals looked wrong.

---

## Updates

Changes mean a new APK. Commit the new code, run the workflow, install the new APK over the old
one. Your data survives because Expo reuses the same signing key.

If an install ever refuses: back up, uninstall, install fresh, restore.

---

## What the numbers mean

- **Occupancy** — tickets sold against seats available
- **Profit after all costs** — revenue, minus that day's direct spend, minus the day's share of
  the month's fixed costs. Monthly costs are divided across the days of the month.
- **Break-even** — how many tickets cover the day's full cost load, including a slice of the
  film's booking cost. Shown as both a ticket count and an occupancy percentage.
- **Baseline index** on a run — that run's revenue per day against the average across all your
  runs. Above 1.00 means it beat your own normal.
- **Holding** — day 7 revenue against day 1. Low means the film emptied out fast.

Comparisons across films need roughly ten runs before they mean much. Weekday patterns need
about two months. Year-on-year needs a year.
