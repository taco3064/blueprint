---
"@kekkai/blueprint": patch
---

**A finding whose header repeats now carries the word that tells it apart.** A
finding's identity is three-part — the baseline keys on `rule` + `path` + `subject` —
and the Architecture Report's header showed the first two, so several findings a
reader resolves separately printed one identical line, with the distinguishing word
several lines down in the prose and the same for every one of them.

```
# before, on a modular project declaring two layers no module holds yet
· [missing-layer] src
    Declared layer "hooks" holds no code in any module yet — …
· [missing-layer] src
    Declared layer "contexts" holds no code in any module yet — …

# after
· [missing-layer] src — hooks
    Declared layer "hooks" holds no code in any module yet — …
· [missing-layer] src — contexts
    Declared layer "contexts" holds no code in any module yet — …
```

- **The subject joins a header only where that header repeats.** Printed always, it
  would restate a specifier the message already names in a sentence, on every import
  finding in every report. Printed here, the invariant is one a reader can state:
  every header line is either unique already or carries what makes it so. The two
  notes above are two lines; a lone note at the same address keeps its bare header,
  because its rule id is doing the work.
- **`architecture.modules` made this frequent, not possible.** Every layer-level note
  is addressed at the source root under `modules` — correctly, since a layer living
  inside every module has no single path — so four notes could share one address. But
  a **flat** project reaches the same repetition with no `modules` in the config:
  `owns-not-installed` walks one layer's `owns` list at one path, and the per-import
  rules fire once per import ref, so a layer owning two uninstalled packages, or a
  file with two deep imports, printed two identical headers too. Both are fixed, and
  both were measured through `dist/bin.js` rather than reasoned about.
- **No finding is added, suppressed, reworded or merged.** The set of findings, every
  message, every severity and the exit code are unchanged — this is the header line
  and nothing else.
- **`inspect --json` is untouched**, byte for byte on every fixture: it already
  carried `subject` as its own field, which is why the answer was available to the
  renderer without measuring anything new.
- A flat project's text output is unchanged **except** where it was printing one
  header twice. Verified by rendering eight fixtures through `dist/bin.js` before and
  after — plain, `--json`, `--update-baseline` and `--baseline` each — where the only
  files that differ are the four with a repeated header.
