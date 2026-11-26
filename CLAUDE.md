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
npm run verify:sites
```

`verify:sites` runs the unit tests, checks window mounts against the GLB, builds the production worker, and boots it on loopback with a disposable D1 database. It checks the packaged migrations and hosting manifest, fetches the planner and model, and reads and writes both a legacy and a new show. Use `node --test` for a quick iteration.

For a separate interactive preview, initialize a fresh local D1 database once after the build. For an existing database, apply only pending migrations from `web/drizzle/`. Run this command from `web/`.

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

1. Run `npm run verify:sites` from `web/` and commit the finished work in the feature worktree. Add new D1 migrations for schema changes so installations with saved shows can upgrade.
2. From the checkout that owns `main`, bring it up to date with `git pull --ff-only origin main`, merge the feature branch, and push with `git push origin main`. A merged GitHub pull request also completes this step.
3. Record the full SHA of the commit that landed on `main`. For a pull request, use its merge or squash commit. Fetch `origin` and verify that `git merge-base --is-ancestor <release-sha> origin/main` succeeds before cleanup.
4. Once the worktree is clean and its changes are on GitHub, remove the feature worktree from another checkout, then delete its local branch. If the feature branch was also pushed to GitHub, delete that remote branch too.

Give the maintainer a handoff they can paste into Codex with these details.

- The GitHub commit link or full release SHA on `main`, and the result of its **Sites compatibility** check.
- What changed and how to verify it in the planner.
- Which tests, build, and browser checks passed, and anything still unverified.
- Any D1 migrations, changes to saved-design compatibility, or updated Blender and GLB assets that affect release.

## Publish from the Sites checkout

When the maintainer asks to publish, Codex follows these steps.

1. Confirm the **Sites compatibility** check passed for the requested SHA. A later commit on `main` is a separate release candidate.
2. Sync the existing Sites checkout and record the current live version. Apply the reviewed `web/` changes since the last integrated GitHub revision at the checkout root. Preserve the live project ID, database binding, historical patch data, and other Sites-only changes. Review any overlap before continuing.
3. In that checkout, set `EXPECTED_SITES_PROJECT_ID` to the existing Site ID obtained from Sites. Run `npm run verify:sites` against the integrated source. A failing check stops publication. Package the verified build with the existing Sites workflow.
4. After publishing, confirm deployment succeeded and open the live planner to verify the changed workflow using read-only checks where possible. Record the GitHub SHA and Sites version in the handoff. The prior version is the code rollback target if it remains compatible with applied database migrations.

Pushing to GitHub runs checks. Publishing remains a separate maintainer-requested operation.
