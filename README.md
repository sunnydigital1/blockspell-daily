# Blockspell Daily (Reddit)

Blockspell, the block-puzzle roguelite, ported to Reddit as a daily game on Devvit Web.
Everyone plays the same daily spell (same pieces, spells and boss), gets one try, and lands on a
per-day leaderboard inside the post. A new daily post goes up automatically at midnight UTC.

This is a port of my own game (originally built for the open web). Entered for
**Best Ported Daily Game** in Reddit's Game of the Day Hackathon.

## What's in the Reddit version

- **Feed card (splash):** today's number, the top 3, your score and rank, one Play button.
- **Daily screen:** your score, `#rank of N players today`, the top 5, Comment score and Share.
- **Comment score** posts your result (`Blockspell Daily #54 🟩🟩⬛ 3,333`) to the thread,
  as you if you allow it, otherwise as the app crediting `u/you`. Once per day.
- **One try per day across devices:** the server keeps your first result; saves sync through Redis.
- **Full game is still there:** Menu has normal runs, Endless, the Spellbook and the Style shop.
- **No ads:** revive, re-spin and the extra spell choice are free once per run.

## Layout

```
src/client/bs/        the original game scripts (core, gfx, audio, game), lightly patched
src/client/game.ts    Reddit platform layer: save sync, daily submit, comment, share sheet
src/client/splash.*   the inline feed card
src/server/           Hono server: /api/init, /api/save, /api/daily, /api/board, /api/comment
                      menu item, install trigger, daily-post scheduler
src/shared/api.ts     types and UTC date helpers shared by both sides
devvit.json           entrypoints, permissions (redis, reddit), cron "1 0 * * *"
```

## Run it (Windows, PowerShell)

1. Install Node.js 22 or newer (24 is what the Devvit template recommends).
2. In this folder:
   ```
   npm install
   npx devvit login
   ```
3. Make a small test subreddit you moderate, for example `r/blockspell_dev`.
4. Upload once, then start a playtest:
   ```
   npx devvit upload
   npx devvit playtest blockspell_dev
   ```
   If `upload` says the name `blockspell-daily` is taken, change `"name"` in `devvit.json`
   (and `package.json`) to something unique and run it again.
5. Installing the app posts today's daily. You can also use the subreddit's mod menu:
   **Post today's Blockspell daily**.

`npm run build` builds into `dist/`. `npm run test:types` and `npm run lint` check the code.

## Submission checklist (deadline Dec 8, 2026, 6:00 pm PST)

- App listing link: `https://developers.reddit.com/apps/<app name>`
- Demo post link: a public post in your subreddit running today's daily
- Say in the submission that it is a port of Blockspell, which you made and own
