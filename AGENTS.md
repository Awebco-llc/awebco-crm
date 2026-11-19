# Workspace continuity

Use the selected project checkout for routine work. At task start, inspect its branch and existing changes and fetch `origin` once before claiming it is current. Fast-forward a clean `main` when safe; preserve and reconcile local work before updating a dirty or divergent checkout. Cached tracking refs are not a fresh GitHub check.

Use an isolated worktree only for concurrent work or a concrete conflict. Prefer a Codex-managed worktree or a durable project worktree; do not create source/release checkouts under `/tmp`. After an authorized push or merge, bring the normal project checkout up to date without disrupting another active task. Preserve unique source and needed ignored configuration and verify published commits before removing a temporary checkout.

Finish authorized work by committing and verifying it on GitHub. Keep unfinished or unreleased work on a clearly named branch with the correct upstream; never merge or deploy it merely to clean the workspace. Honor explicit local-only instructions. Leave the normal project checkout clean on current `main` when safe, or briefly report the intentional exception. Do not leave completed changes, hidden stashes or obsolete worktrees for the next chat to rediscover.

# Validation and secrets

Review existing changes before editing and keep fixes scoped. Run affected checks once; documentation-only changes need a whitespace check, not an application build or deployment. Preserve unrelated work. Never commit credentials, local environment files, generated builds or dependency directories. Workspace synchronization alone does not require a deployment.
