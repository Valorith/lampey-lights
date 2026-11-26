# Lampey Lights

## Claude Code workflow

Start Claude Code from the repository root with `claude --worktree <feature-name>`. Edit and commit on that feature branch. Codex takes the commit through release testing, merge, and publishing.

- Edit the planner in `web/`. It uses React, Three.js, Vinext, and a D1 database.
- Edit the Blender scene and its generator in `model/`. The app loads `web/public/property.glb`.
- Keep edits in the GitHub worktree. Codex manages `studio/`, the separate ChatGPT Sites publishing checkout.
- For schema changes, add a new D1 migration so existing shows can upgrade.
- This repository is public. Use sample patch data in `web/lib/history.json` and keep household worksheets, source photos, credentials, and local databases out of commits.
- Keep interface copy concise. Cut taglines, helper text, and secondary labels when the layout can convey the information.

### Isolation for local tests and previews

If you run tests or a preview, work from the feature worktree’s `web/` directory with sample data and a local D1 database. Keep build output and preview state in that worktree. Reserve the Sites checkout, deployment credentials, and hosted database for Codex.

The `verify:sites` script creates a disposable database and picks a free loopback port. For an interactive preview, use `127.0.0.1`, an unused port, and the worktree’s own `.wrangler/state`. Stop only processes you started and clean up your own test artifacts. See the [local setup commands](README.md#run-locally).

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
