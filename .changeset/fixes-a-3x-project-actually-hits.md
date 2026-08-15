---
'@kekkai/blueprint': patch
---

**Four things that were wrong in `3.1.0` on a project with no modules in sight.**

- **The emitted documents said a same-layer import is banned outright, and it is
  not.** A folder layer's sibling is reachable through its entry with a relative
  path (`../Sibling`); only the alias form, and paths reaching past that entry,
  are errors. The emitted handbook, the emitted agent contract and the authoring
  playbook all stopped at an earlier reading of the rule and prescribed *"extract
  the shared code to a lower layer"* — which is the move
  `blueprint/relative-escape` names as how a `utils/` junk drawer gets built one
  honest decision at a time. **If you adopted `3.x` and sank shared code on that
  advice, the imports you were avoiding were legal.** All three now state the rule
  the lint run enforces.
- **Two findings you have to resolve separately printed one identical line.** A
  finding's identity is three-part — the baseline keys on rule, path and subject —
  while the report's header showed the first two, leaving the distinguishing word
  several lines down and the same for both. Rendered on one file with two deep
  imports, before and after:

  ```
  # 3.1.0
  ✗ [deep-import] src/components/Card/index.js
  ✗ [deep-import] src/components/Card/index.js

  # 4.0.0
  ✗ [deep-import] src/components/Card/index.js — ~app/hooks/useA/impl
  ✗ [deep-import] src/components/Card/index.js — ~app/hooks/useB/impl
  ```

  The subject joins the header only where that header repeats, so a lone finding
  keeps its bare line and no import finding gains a restatement of the specifier
  its own sentence already names. No finding is added, suppressed, reworded or
  merged, the severities and the exit code are unchanged, and `inspect --json` is
  untouched — it already carried `subject` as its own field.
- **`deps` ranked folders it called invisible two lines later.** A relative import
  into a folder your config does not declare minted a node in the module graph, so
  the leaderboard listed that folder directly above its own note saying it is not
  under a declared layer and invisible to `deps`. Node admission now asks the same
  lookup that decides which emitted entry governs a file, and `undeclared-folder`
  still names it — at the level that can act on it.
- **`Finding.path`'s doc comment was wrong about `cycle`.** The type is exported
  from the package entry and said *"relative to the project root"*. A cycle's
  address is relative to the **source root**, and it is a module graph node key
  rather than a file, so one report could show one folder under two addresses.
  The address itself does not move — no baseline entry changes and no upgrade
  turns a suppressed cycle fresh. The doc comment, the reference page and the
  migration step now say what the address is and which command takes it:
  `blueprint deps <key>` gives the fan-in at either end before you choose which
  edge to invert.
