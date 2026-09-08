# Daily Hub

A single-page daily checklist for working through placement, university and health each morning.

Open `index.html` in a browser. That's it — no install, no build, no account.
Everything is saved in that browser's `localStorage`, so nothing ever leaves the device.

## The three pages

**🏥 Placement** — the morning check-in (check clinic emails, submit logbook, check
phone notes), a running task/goal list with optional due dates, and a free-text note
for the day.

**🎓 University** — the weekly check-in (finish weekly notes before Thursday class,
update readings into a podcast, listen to the weekly podcast content), tasks and
deadlines, and a searchable notes library for lectures, readings and general notes
(filter by type, search by title, unit or body text).

**💪 Health** — daily targets that reset each morning: gym (tick), steps (10,000),
water (8 glasses, +/− buttons), meditation (tick), sleep (7 hrs). Each target keeps
a streak, and the last 14 days show as a small heatmap. There's also a health goals
list for one-off things like booking physio.

## How it works day to day

- The header shows the date and a progress bar per page. Use `‹` / `›` to look at
  another day, and tap the date to jump back to today.
- **Check-in items** and **health targets** are recurring — they come back blank every
  morning, and each day's ticks are stored separately, so you keep a history.
- **Tasks** are one-off — they stay on the list until you tick them, whatever the date.
- Everything is editable: `+ Item` adds a check-in step, `+ Target` adds a health goal,
  `+ Note` adds a note, and the `×` on any row deletes it.
- `Export data` writes a JSON backup; `Import data` restores one (handy when moving
  to a new phone or browser). `Clear this day` wipes just the day you're looking at.

## Using it on your phone

Serve the folder and open it on your phone on the same network:

```bash
python3 -m http.server 8000     # then visit http://<your-computer-ip>:8000
```

Or push it to GitHub Pages and add it to your home screen — it's a plain static site.
Note that browser storage is per-device, so use Export/Import to move data across.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Page structure for all three tabs |
| `styles.css` | Styling, light and dark theme |
| `app.js` | State, storage, and all rendering |
| `tests/smoke.mjs` | Browser smoke test covering all three pages |

## Running the test

```bash
npm install --no-save playwright
npx http-server -p 8123 -s .    # in one terminal
node tests/smoke.mjs            # in another
```

## Hosted version

`artifact/daily-hub.html` is the version published as a Claude Artifact for phone use:
https://claude.ai/code/artifact/41cca498-a545-4eeb-99c6-e36ac14e7d10

Same three pages, redesigned as a clinical "day sheet", with two differences that only
work when it's hosted:

- **Storage is server-side**, via the artifact `db` capability, so the same data opens
  on your phone and your laptop. `localStorage` is kept as a cache so the page paints
  instantly and still works if storage can't be reached — the footer says which is in use.
- **Backups** go through the `downloads` capability, since hosted pages can't offer a
  file through a plain link.

It's a separate file from the static app in the repo root — edit whichever one you're
actually using. To republish after an edit, publish `artifact/daily-hub.html` to the
URL above.
