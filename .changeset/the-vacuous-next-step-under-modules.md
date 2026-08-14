---
"@kekkai/blueprint": patch
---

**The vacuous-net next step now names an address a modular config can actually hold.** It
built its example as `<sourceRoot>/<layers[0].name>/`, which is a layer folder only under a
flat config. Under `architecture.modules` a layer is a folder inside a module, so the path
it named was a top-level folder holding source — and the report it ends said exactly that,
four rows above it:

```
info  [missing-layer]      src — components
      … Do not create `src/components` to satisfy it: a top-level folder holding source
        is an undeclared module, which `inspect` reports as an error …
⚠ … next: move code into a declared layer (e.g. src/components/) and the net arms itself
```

With those folders on disk it is worse than two truths without a bridge: the same report
carries `✗ [undeclared-module] src/components`, so the last line an adopting agent reads
pointed at a failure printed above it. `doctor` is the worse surface of the two — the same
sentence sits under a passing `✓ architecture clean`, with no findings on screen to
contradict it, so a ✓ endorsed the instruction.

Three arms now, still one text behind both call sites:

- **flat** — unchanged, word for word. `src/pages/` is a real layer folder there and
  `layers[0]` is the right one to name.
- **modular** — `<root>/<module>/<layer>/`, carrying why the address has two segments.
  That clause is not decoration: `doctor` prints no findings, so under its ✓ it is the only
  cause on screen.
- **every module `layers: false`** — no inner layer exists to name, and the shorter address
  is the true one rather than a fallback: such a module is netted entire, so code anywhere
  inside it arms the gate.

**The module named is the first that is not `layers: false`, not `modules[0]`.** The example
exists to demonstrate the two-segment shape and an opted-out module cannot demonstrate it.
The preset's own first module is `app`, and declaring `app` as a routing module is the
documented use of the opt-out — so index zero would print "there is no inner layer" for a
config that has layered modules.

The regression test asserts the composition rather than the line: it parses the example path
out of the footer, then asks the rest of the report what it says about that exact path — no
`Do not create` for it, and no error finding whose path equals it. A line that reads
correctly alone and wrongly as the report's last word is not something a per-line assertion
can see.
