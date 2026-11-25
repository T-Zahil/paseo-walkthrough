Walkthrough explains a change the way a product manager would, in a panel next to your agents: what changes for users, why it matters for the business, what the screens look like and what to check before shipping. No code.

An agent reads the diff and the code around it, then writes a title, a one-sentence pitch, a short summary, the business stakes (revenue, conversion, retention, trust, SEO, costs, operations) and a step-by-step tour in the order a user meets the change. Each step flags risks, decisions to make and open questions. An optional review scores the business impact out of 10 and lists what could go wrong.

## Real screenshots

For web projects, the plugin starts the worktree's dev server, opens every added or changed page and screenshots it on desktop and mobile. The screenshots appear in the overview and in each step, with what changes and where to look.

The plugin picks the first capture method that applies:

1. The capture command from the plugin settings.
2. A `scripts/qa-screenshots.ts` script in the project.
3. The project's own Playwright install (`node_modules/.bin/playwright`), using Chromium. The plugin never downloads Playwright or a browser.

It starts the server with the dev server command from the settings, or with the project's `dev` script on a free port. Pages that need a signed-in user show the sign-in page unless your capture command signs in. Screenshots are optional and can be turned off in the settings.

## Reading a walkthrough

- The overview shows the affected screens, the steps as cards (seen, flagged) and a checklist of things to try before shipping.
- On desktop, `j` and `k` move between steps and `x` marks a step as seen.
- From a step, send a question to an agent in the workspace, or start a new session on a worktree branched from the current branch, with the agent already briefed.

## Settings

Choose the agent and model, the language of the walkthrough (the app's language by default), the scope opened by default (this branch, uncommitted changes or the last commit), whether to include the review, the dev server and capture commands, and extra instructions for the agent.

## Data and permissions

- The diff, the changed file list and your extra instructions are sent to the agent provider you choose, which reads more of the repository with read-only commands. The plugin answers the agent's permission requests itself: it allows read-only commands such as `git diff`, `grep` and `cat`, and denies everything else.
- Screenshots run your project's dev server and capture command on your machine. Pages are loaded from `localhost` only.
- Walkthroughs, screenshots and reading progress are stored in the worktree's git directory (`.git/paseo-walkthrough/`), never in the repository itself.
- Questions you ask from a step are sent to the agent you pick, with the step's text and the files behind it.
- Each generation costs one agent turn; the cost appears under the title when the provider reports it.

Requires Paseo 0.17 or later. Screenshots run on macOS and Linux.
