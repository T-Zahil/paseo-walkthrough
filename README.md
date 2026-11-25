# Walkthrough for Paseo

A [Paseo](https://paseo.sh) plugin that explains a git change like a product manager would: what changes for users, the business stakes, real screenshots of the affected screens and what to check before shipping. See [OVERVIEW.md](OVERVIEW.md) for what it does and what data it sends.

## Install

From the Paseo plugin gallery, or with the CLI:

```bash
paseo plugin add git:T-Zahil/paseo-walkthrough
```

Open a workspace, then open the **Walkthrough** panel from the panel menu, the Command Center or `/walkthrough`.

## Screenshots

Screenshots need a web project with a dev server. The plugin starts it on a free port, warms each page, then runs the first capture method that applies:

| Method | When |
| --- | --- |
| Capture command from the settings | The setting is not empty |
| `bun run scripts/qa-screenshots.ts --routes {routes} --out {out} --base-url {baseUrl}` | The project has that script |
| `node_modules/.bin/playwright screenshot --browser=chromium …` | The project has Playwright installed |

The dev server command defaults to the project's `dev` script with `--port <port>`, run with bun, pnpm, yarn or npm depending on the lockfile. `PORT` is also set. Set your own command in the settings; `{port}` is replaced with the free port.

A custom capture command receives `{routes}` (comma-separated paths), `{out}` (an empty directory) and `{baseUrl}`. Write one PNG or JPEG per route and viewport into `{out}`, named `<slug>-desktop.png` and `<slug>-mobile.png`, where the slug is the path with every non-alphanumeric run turned into `-` (`/` is `home`). Alternatively print one line per shot:

```
✓ /pricing (desktop) → /path/to/out/pricing-desktop.png
✗ /account (mobile): timeout
```

When the `qa-screenshots.ts` script is used, the plugin copies the most recent signed-in session it left in another worktree of the repository (`.qa/.auth/storage-state.json`, less than 12 hours old) so screens for signed-in users can be captured.

On macOS, screenshots are converted to JPEG with `sips` to keep the panel fast.

## Develop

```bash
npm install
npm run typecheck
npm test
paseo plugin install ./        # from this directory, on a test daemon
paseo plugin reload paseo-walkthrough
```

`client/locales/en.ts` holds the interface text; `fr.ts` must define every key. Server responses stay language-neutral and the client words them.
