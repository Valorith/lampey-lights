# Lampey Lights

## Claude Code workflow

Start Claude Code from the repository root with `claude --worktree <feature-name>`. Edit and commit on that feature branch. Local tests and previews are optional. Codex takes the commit through release testing, merge, and publishing.

- Edit the planner in `web/`. It uses React, Three.js, Vinext, and a D1 database.
- Edit the Blender scene and its generator in `model/`. The app loads `web/public/property.glb`.
- Keep edits in the GitHub worktree. Codex manages `studio/`, the separate ChatGPT Sites publishing checkout.
- For schema changes, add a new D1 migration so existing shows can upgrade.
- This repository is public. Use sample patch data in `web/lib/history.json` and keep household worksheets, source photos, credentials, and local databases out of commits.
- Keep interface copy concise. Cut taglines, helper text, and secondary labels when the layout can convey the information.

### Optional local testing

Work from the feature worktree’s `web/` directory with Node.js 22.13 or newer. Run `npm ci` there on first use or when the lockfile changes. Use sample shows and keep dependencies, generated builds, and local database state in that worktree. The Sites checkout, publishing credentials, and hosted database are reserved for Codex.

- For a quick check, run `node --test`.
- For a full check, run `npm run verify:sites`. It builds the worker, starts it on an automatically assigned loopback port, and tests the planner, model, and saved shows with a disposable local D1 database.

For an interactive preview, build with `npm run build` if you have not already run the full check. Initialize the worktree’s local D1 database by running the command below for each pending migration in order, substituting its filename. A fresh database starts with the file shown.

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_clear_flatman.sql
```

Start the preview on a free port, for example `npm start -- --port 4181`, and open the loopback URL it prints. For live editing, use `npm run dev -- --hostname 127.0.0.1 --port 4181`. If the port is occupied, pick another. Stop only the preview you started and clean up your temporary test artifacts when finished.

### Hand off the commit

Give Codex the branch name, full commit SHA (`git rev-parse HEAD`), what changed, and the planner behavior to verify. Report any checks you ran, their results, and anything untested. Flag migrations, saved-design changes, and model assets that need regeneration. Leave the branch and worktree available for Codex.

## Codex validates and merges

Review the handed-off commit against the latest `origin/main`. Run `npm run verify:sites` from `web/` on the integrated candidate and exercise the changed planner workflow in a local preview. For saved-design changes, save and reopen a sample show. If resolving a conflict or fixing a failure changes the candidate, validate the resulting revision.

For property geometry changes, follow the [model notes](model/README.md) to regenerate any pending assets. Copy the updated `model/Lampey Property.glb` to `web/public/property.glb`, run `node scripts/extract-window-frames.mjs` from `web/`, and commit any changed assets and window-frame data before validating the build.

1. Once local checks pass, merge the verified changes into `main` and push to GitHub. Record the full SHA that landed on `main`.
2. Confirm **Sites compatibility** passed for that exact SHA. If it fails, investigate and verify the fix before handing off a release candidate.
3. After confirming the changes are on `origin/main` and the feature worktree is clean, remove the finished worktree and its local feature branch. Delete the remote feature branch if one was pushed.
4. Report the GitHub commit, check result, and what was verified in the planner.

## Publish from the Sites checkout

When the maintainer asks to publish, Codex follows these steps.

1. Confirm the **Sites compatibility** check passed for the requested SHA. A later commit on `main` is a separate release candidate.
2. Sync the existing Sites checkout and record the current live version. Apply the reviewed `web/` changes since the last integrated GitHub revision at the checkout root. Preserve the live project ID, database binding, historical patch data, and other Sites-only changes. Review any overlap before continuing.
3. In that checkout, set `EXPECTED_SITES_PROJECT_ID` to the existing Site ID obtained from Sites. Run `npm run verify:sites` against the integrated source. A failing check stops publication. Package the verified build with the existing Sites workflow.
4. After publishing, confirm deployment succeeded and open the live planner to verify the changed workflow using read-only checks where possible. Record the GitHub SHA and Sites version in the handoff. The prior version is the code rollback target if it remains compatible with applied database migrations.

Pushing to GitHub runs checks. Publishing remains a separate maintainer-requested operation.
