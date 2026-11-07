# Discipline · 40 Days

A minimalist habit tracker for a 40-day discipline challenge. Built as a static
progressive web app (PWA) — no build step, no dependencies, no backend.

## Features

- **Yes / no marking** — ✓ done · ✕ not done; write partial results (for example "8 of 12") in the notes
- **Schedules** — a habit runs every day, on chosen weekdays, or on the 13th–15th of the Hijri
  month (Umm al-Qura calendar); off-schedule habits are dimmed and do not count that day
- **Emotion log** — six emotions with emoji, plus "why" and "what could be better" notes per habit
- **Extra tasks** — one-off daily reminders; unfinished ones roll over to today automatically
- **Summary** — done rate, streaks, daily progress, habit consistency and emotion spread,
  filterable by period (7 days / 30 days / this month / all / custom range)
- **6 themes** — Dark, Light, Pink, Pastel, Forest, Ocean
- **Offline-first** — installable to the home screen, works with no connection
- **Local data** — everything stays in the browser; export to JSON and import it back anytime

## Usage

Open `index.html` in a browser, or host it (see below) and add it to your home screen.

- Tap the circle to cycle a habit: ✓ → ✕ → blank
- Tap the ▾ button to open emotions and notes
- Use the ‹ › arrows or the week strip to move between days
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
