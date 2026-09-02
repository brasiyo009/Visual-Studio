# Repository Instructions

## Version control workflow

- After completing each user-requested application version, review the final diff, run the relevant checks, commit the finished change, and push it to `origin/main` before handing it off.
- Treat a version as a completed user-requested change, not an intermediate edit or experiment.
- Stage only files that belong to the completed version. Preserve unrelated user changes and exclude generated artifacts, credentials, secrets, and local environment files.
- Use a concise commit message that describes the completed version.
- Do not amend published commits, rewrite history, or force-push unless the user explicitly requests it.
- Do not introduce new failing checks. If a known baseline check still fails for an unrelated reason, report it clearly with the commit and push result.
- If authentication or connectivity prevents the push, keep the commit locally and report the blocker instead of claiming the version was synchronized.
- In the final response, report the branch, commit SHA, push status, and verification results.

