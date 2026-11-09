# Discipline · 40 Days

A minimalist habit tracker for a 40-day discipline challenge. Built as a static
progressive web app (PWA) — no build step, no dependencies, no backend.

## Features

- **19 default habits** — the daily worship and personal routine, including scheduled fasting; existing users can add missing defaults from the menu without replacing records
- **Yes / no marking** — ✓ done · ✕ not done; write partial results (for example "8 of 12") in the notes
- **Flexible start date** — choose Day 1 from the menu, including a future date; changing it keeps existing records
- **Schedules** — a habit runs every day, on chosen weekdays, or on the 13th–15th of the Hijri
  month (Umm al-Qura calendar adjusted back one day); off-schedule habits are dimmed and do not count that day
- **Calendar and Hijri dates** — the week strip still moves one day at a time; tap the date heading to open a month
  calendar and jump to any day. Both show the Hijri day (Umm al-Qura), with 13–15 Hijri in bold and a dot for the day's done rate
- **Emotion log** — six emotions with emoji, plus "why" and "what could be better" notes per habit
- **Extra tasks** — one-off daily reminders; unfinished ones roll over to today automatically
- **Summary** — done rate, streaks, daily progress, habit consistency and emotion spread,
  filterable by period (7 days / 30 days / this month / all / custom range)
- **6 themes** — Dark, Light, Pink, Pastel, Forest, Ocean
- **Offline-first** — installable to the home screen, works with no connection
- **Local data** — everything stays in the browser; export to JSON and import it back anytime

## Usage

Open `index.html` in a browser, or host it (see below) and add it to your home screen.

- Existing installations keep their saved habits; use **Add default habits** in the menu to add missing defaults without changing records or the start date
- Open **Challenge start date** in the menu, choose your Day 1 and save; before that date, the banner shows when it starts
- Tap the circle to cycle a habit: ✓ → ✕ → blank
- Tap the ▾ button to open emotions and notes
- Use the ‹ › arrows or the week strip to move between days, or tap the date heading to pick from a month calendar
- In the month calendar, tap its heading to choose a month, then tap the year heading for a 12-year period; use the arrows to browse periods
- In **Edit habits**, tap the weekday chips (or 13–15 Hijri) under a habit to set its schedule;
  with none selected the habit runs every day
- Switch to **Summary** for charts

## Deploy

**Netlify** — drag this folder onto <https://app.netlify.com/drop>

**GitHub Pages** — push this repo, then Settings → Pages → Branch: `main` → `/ (root)`

After changing any file, bump `CACHE` in `sw.js`. Installed copies keep serving the
cached files until that name changes.

## Data

Stored in the browser's `localStorage` on the device you use, under keys that start with
`disiplin40:`. It is not synced across devices. Use **Export data** for a JSON backup and
**Import data** to restore one (it replaces the current data); **Reset data** clears everything.
If the browser refuses to save, a red bar asks you to export a backup.

## Structure

```
index.html            page markup
styles.css            styles and the six themes
app.js                app logic (storage, daily view, tasks, summary, menu)
manifest.webmanifest  PWA metadata
sw.js                 service worker (offline cache)
icon-192.png          app icon
icon-512.png          app icon
```

## License

MIT — see [LICENSE](LICENSE).
