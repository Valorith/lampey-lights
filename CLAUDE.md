# Lampey Lights

## Where to work

Start Claude Code from the repository root. For parallel work with Codex, use `claude --worktree <feature-name>` so each session has its own branch and checkout.

- Edit the planner in `web/`. It uses React, Three.js, Vinext, and a D1 database.
- Edit the Blender scene and its generator in `model/`. The app loads `web/public/property.glb`.
- `studio/` is a separate, ignored ChatGPT Sites publishing checkout on the maintainer’s machine. Keep Claude’s edits and local testing in the GitHub worktree. Codex handles publishing.
- This repository is public. Use sample patch data in `web/lib/history.json` and keep household worksheets, source photos, credentials, and local databases out of commits.
- Keep interface copy concise. Cut taglines, helper text, and secondary labels when the layout can convey the information.

## Test locally

Use Node.js 22.13 or newer. From the repository root, run the following in a fresh worktree. Repeat `npm ci` when the lockfile changes.

```sh
cd web
npm ci
node --test
npm run build
```

For a fresh local database, initialize D1 once after the build. For an existing database, apply only pending migrations from `web/drizzle/`. Run this command from `web/`.

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_clear_flatman.sql
```

Run `npm start -- --port 4173` from `web/` and open `http://127.0.0.1:4173` to test the build. For live editing, use `npm run dev -- --hostname 127.0.0.1` and open the printed URL. Exercise the changed workflow with a local sample show. For changes to saved designs, reload and verify the result. Stop the preview with Ctrl+C when finished.

For property geometry changes, use the [model notes](model/README.md). Copy the updated `model/Lampey Property.glb` to `web/public/property.glb`, then run the following from `web/`. Include the updated assets and any changed window-frame data in the feature commit.

```sh
node scripts/extract-window-frames.mjs
node scripts/extract-window-frames.mjs --check
node --test
```

## Merge, clean up, and hand off to Codex

1. Test and commit the finished work in the feature worktree.
2. From the checkout that owns `main`, bring it up to date with `git pull --ff-only origin main`, merge the feature branch, and push with `git push origin main`. A merged GitHub pull request also completes this step.
3. Record the full SHA of the commit that landed on `main`. For a pull request, use its merge or squash commit. Fetch `origin` and verify that `git merge-base --is-ancestor <release-sha> origin/main` succeeds before cleanup.
4. Once the worktree is clean and its changes are on GitHub, remove the feature worktree from another checkout, then delete its local branch. If the feature branch was also pushed to GitHub, delete that remote branch too.

Give the maintainer a handoff they can paste into Codex with these details.

- The GitHub commit link or full release SHA on `main`.
- What changed and how to verify it in the planner.
- Which tests, build, and browser checks passed, and anything still unverified.
- Any D1 migrations, changes to saved-design compatibility, or updated Blender and GLB assets that affect release.

When the maintainer asks to publish, Codex uses that commit on `main` to apply the relevant `web/` changes at the root of the Sites checkout. The release uses the existing Site’s hosting identity and installation-specific patch data. Publishing to ChatGPT Sites is a separate step from pushing to GitHub.
