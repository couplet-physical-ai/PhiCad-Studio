---
description: Analyze and clean implemented plans
agent: sisyphus
---
ANALYSIS MODE: parallelize 1-2 explore agents to map `.sisyphus/plans/*.md` against current codebase evidence, classify each as implemented/partial/not-started, delete only fully implemented plans, keep partial/not-started plans, update `.sisyphus/active.md` and `.sisyphus/boulder.json`, remove stale references in `.sisyphus/drafts` and `.sisyphus/notepads`, then return: deleted list, kept list, remaining plan count, and any unresolved refs.
