---
"@kekkai/blueprint": minor
---

**An interrupted install now leaves a tree that one command finishes.**

`init` installs dependencies as part of its work, and the alias edits to `tsconfig` /
`vite.config` used to sit *below* that step. On a machine that cannot reach the registry,
stopping the install left a config, an agent contract and an ESLint config with no alias
anywhere in the toolchain — and `doctor` then reported `~app resolves nowhere`, which reads
as a broken tool rather than as an install that never finished. Two toolchain files had to
be hand-edited to clear the final gate.

Every filesystem effect now lands **above** the install, so what an interrupted run leaves
behind is a complete tree minus `node_modules`.

**And the install announces itself before it runs.** It is the one step that can sit for
minutes — a package manager with no route to the registry retries in silence — so the line
above it now carries the command it is about to run, that quiet is normal, that minutes of
quiet means stopping it and running that line yourself or re-running with `--no-install`,
and what stopping leaves behind:

```
→ install: eslint, @kekkai/blueprint, …
      npm install -D eslint @kekkai/blueprint …
      This is the one step that needs the registry. Silence while it works is normal;
      minutes of silence means it cannot get there — stop it and run the line above
      yourself, or re-run init with `--no-install`. …
      Stopping is safe: this is the last step, so every file above is already on disk.
      What stopping omits is these packages in `package.json` — this line is the only
      thing that records them there, so until it runs, a failure naming one of them is
      that gap and not a broken adoption.
```

No version list to go find: these are your project's dependencies. Which ESLint major
that resolves to, and what backs it, is its own entry.
