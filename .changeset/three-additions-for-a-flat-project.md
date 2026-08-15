---
'@kekkai/blueprint': minor
---

**Three additions a flat project gets without declaring anything.**

- **`inspect` notes an `owns` entry whose package is not installed.** A new
  `owns-not-installed` finding names the package and the level that declares it,
  and says that installing it and dropping the declaration are both resolutions.
  It is `info` — declaring ownership ahead of the install is the legitimate order,
  so the ban is correct and simply has nothing to reach yet — which means it does
  not set the exit code and never enters the baseline as debt.
- **The agent contract names the test-support door.** Its "Where code goes"
  section now names your own `architecture.testFiles` globs, so an agent blocked
  on files that exist only to serve tests knows there is a third door to ask
  about. It is a reporting instruction rather than a remedy: widening the globs
  stays your edit, and renaming a file to match them is called out as never being
  the fix. Rendered from your blueprint, so `testFiles: []` renders nothing.
- **The emitted documents say outright that a green lint proves nothing about a
  new folder.** The layer globs are built *from* your declared names, so no lint
  rule can match inside a folder nobody declared — `blueprint inspect --baseline`
  is the only thing that reports it. The handbook and the agent contract both
  carry that now, instead of leaving an agent to read governance out of silence.

The emitted documents also settle one word. The thing inside a layer is a
**unit**; a **module** is the feature at the top of the source tree. `3.x` called
both a module, which was survivable while there was only one of them.
