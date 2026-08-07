# @kekkai/blueprint

## 3.1.0

**What this release moved, and what it did not.** Worth stating plainly, because most of the
entries below act on one axis and it is not the obvious one.

**Adoption did not get more likely to succeed, because it was already succeeding.** Every
entry here came out of live adoption runs — a real agent CLI taking a real repo through
`init` → `inspect` → `impact` → `doctor` — and across every one of those runs `doctor`
finished green. It finished green before these fixes too. Nothing here rescues a failing
adoption.

**What moved is whether an adopting agent reaches a true conclusion and writes it into its
report.** That is the axis: output an agent reads and acts on, where a confident sentence the
tool could not back turns into a claim in a handoff nobody re-checks. One measured example —
the build step used to assert that `tsc -b` type-checks your vite config edit; an agent
disproved it by injecting a type error there, and the next run's agent reported that the
rewritten passage stopped it from claiming an alias edit it had not verified.

**Six were the tool doing the wrong thing rather than explaining itself badly**, and those
are the ones to read first if you skim: an overwritten hand-written contract, a config path
reaching outside the repo, an interrupted install stranding the alias, `testFiles: []`
emitting a config ESLint refuses, `impact` demanding a plugin no gate would use, and a CRLF
tsconfig silently skipping the alias edit.

**The largest change to how hard this is to break is not in this changelog.** Mutation
testing arrived after 3.0.0 — that tag has no `stryker.config.json` — and the suite roughly
doubled under it. Most of that found places where a wrong edit to the source would have
shipped with every test green. It produced no behaviour you can see, so it has no entry, and
it is still the reason this version is sturdier than the last.

**And the honest bound:** the wording fixes are reasoned, not measured — with one exception,
which is also the reason to hold the rest loosely. The lint-merge instruction was reasoned
too, and one day later a field agent followed it into the wrong edit to its own config;
correcting it took an `eslint --print-config` probe per direction on each of the two ESLint
majors, and the answer was the opposite of what the paragraph advised. Several other fixes
repaired sentences this project had written one or two releases earlier, and those net close
to nothing — they closed gaps their predecessors opened. The per-item paper trail for all of
it, including what was judged not worth fixing and why, is in this repo's closed `field-run`
issues rather than here.

### Minor Changes

- 5aa12b8: **Action required, once: run `npx blueprint inspect --update-baseline`.**

  If you have a `.blueprint-baseline.json`, this release refuses it and prints that
  instruction. Re-keying records the same debt — nothing that was suppressed stops being
  suppressed.

  Why it has to happen: baseline identity used to include the finding's **message text**,
  the one part of a finding that changes while the violation does not. Rewording any
  finding silently retired every baseline entry for that rule — the old debt came back as
  `fresh`, the recorded entries counted as `stale`, and a brownfield CI went red on an
  upgrade that changed no code. Identity is now `rule` + `path` + `subject`, and the
  message is prose the ledger keeps for whoever reads a diff.

  The old baseline is refused rather than reinterpreted: read under the new key it would
  match nothing, which is the wall of red the ledger exists to prevent, arriving with no
  stated cause.

  For `--json` consumers: every finding gains `subject` (what inside `path` the finding is
  about — the import specifier, a cycle's members, empty where the rule and path already
  identify it), and the baseline file is `"version": 2`.

- 5aa12b8: **An interrupted install now leaves a tree that one command finishes.**

  `init` installs dependencies as part of its work, and the alias edits to `tsconfig` /
  `vite.config` used to sit _below_ that step. On a machine that cannot reach the registry,
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

- 5aa12b8: **`doctor` has three outcomes now, not two — and a check that could not run is no longer
  counted as one that passed.**

  The merge-survival check — the only one proving your emitted rules are alive in the config
  ESLint actually resolves — skips rather than fails when that config will not resolve,
  because a red you cannot appease is worse than no check. It used to ride in the pass
  count anyway, so the output read `✓ … (skipped)` above `✓ Adoption complete — all 7
checks passed`.

  What you see instead:

  ```
  ⊘ emitted rules survive the merged eslint config (skipped — could not resolve …)
  ⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run (⊘ above).
    Nothing failed, and nothing here proves what those checks cover.
  ```

  **Exit status is unchanged** — a skip is not a failure. Gate on the JSON instead of the
  exit code when the difference matters:

  ```json
  {
    "ok": true,
    "verdict": "unverified",
    "summary": "⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run …",
    "counts": { "total": 7, "passed": 6, "failed": 0, "skipped": 1 },
    "checks": [{ "label": "…", "ok": true, "skipped": "why it could not run" }]
  }
  ```

  `verdict` is `complete` / `unverified` / `incomplete` and is on `runDoctor`'s return value
  too. `ok` keeps the meaning the exit code needs — nothing FAILED — so `counts.skipped` or
  `verdict` is what a CI gate should read.

  Three more things `doctor` now says out loud:

  - **A green banner on a repo with no version control says what it leaves out** — nothing
    adoption wrote is committed, and a ratchet living only in an uncommitted working tree is
    not installed.
  - **The survival check states its reach**: it compares config text and never executes
    ESLint, one probe per layer, and it does not compare thresholds, package ownership, or a
    merged entry covering only part of a layer. Its ✓ says so.
  - **When it cannot resolve your config it quotes the loader**, so the missing package is on
    screen instead of one `npm run lint` away — and it names the case where that package is
    also absent from `package.json`, which means an install step never finished.

- 5aa12b8: **More of what you need to author a config is now something the tool computed, not
  something you have to go and check.**

  **`blueprint survey` names the specifiers an `owns` clause can be verified with.** `owns`
  takes `{ package: 'react', imports: ['createContext'] }`, and the survey's evidence was
  package-granular — `react` reads as "half the layers use it" whichever specifier the clause
  names, so there was nothing to check such a clause against. There is now a section for
  specifiers that appear in **exactly one folder, from a package that appears in several**:

  ```
  Named imports in ONE folder, from a package in several (specifier-level ownership
  candidates — `owns: [{ package, imports: […] }]`; the rows above cannot support one).
  Read from brace clauses only: a member reached through `import * as` is invisible
  here, so a folder using one is not counted against the "only":
    react → createContext — contexts only
    react → useContext — hooks only
  ```

  **`blueprint rules --json` carries `jsLiteral` beside `selectors`.** The selectors you are
  told to copy when folding blueprint's `no-restricted-syntax` entry into a house one escape
  their path separators — and JavaScript resolves that same escape when it parses a string
  literal, so pasting the rendered value into `'…'` produced a regex that ends early. No parse
  error, lint still green, and the ban silently matching nothing. `jsLiteral` is the selector
  as JS source, quotes included; the text output prints that form, since that line exists to
  be copied. `selectors` is unchanged for programs that build config rather than paste it.

  **One `inspect` run inventories every import cycle**, not just the first one it meets — one
  per strongly connected component, ordered by content so an unrelated module does not
  reshuffle the report. Enforcement never changed (one cycle fails the gate), but "how many"
  is the question anyone sizing a migration is asking.

  **`inspect`'s coverage line names the files outside your layer nets**, so a number you
  could not check became a list you can.

  **Every output that reports the import graph says how the graph was read** — source text,
  not a parsed AST — so a green does not read as a stronger guarantee than it is.

- 5aa12b8: **Two ways `init` could write somewhere you did not point it. Both refused now.**

  **A hand-written contract could be overwritten instead of getting a reference beside
  it.** When a context file exists without blueprint's managed marker block, `init` leaves it
  alone and writes the generated block to a reference file next to it. The reference name was
  built by replacing a trailing `.md` — so for any other extension the replacement did
  nothing, the reference path came out _identical to the original_, and the write landed on
  your document while the plan announced it as a reference.

  Who was exposed: anyone setting an `emit.agents[].path` that is not `.md` — `.mdc` for a
  Cursor rules folder, `.mdx` for a docs site, or no extension at all. The default targets
  are all `.md`, so a repo that never customised a path was never affected. The suffix now
  goes before whatever the extension is (`context.mdc` → `context.blueprint.mdc`), and a
  dotfile keeps its name (`.gitignore` → `.gitignore.blueprint`).

  **A config path could reach outside the repo.** `emit.handbook` and `emit.agents[].path`
  are strings from your config that reached the filesystem unchecked, so
  `emit.handbook: '../HANDBOOK.md'` wrote one directory up — with `✓ write:` printed beside
  the escaping path. The realistic input is not an attack but a relative path off by one
  directory in a monorepo, written by the agent blueprint asks to author the config. The run
  is now refused before a single write, so `--dry-run` cannot print a plan the real run would
  reject, and the refusal names the path, that nothing was written, and the two config fields
  that set one.

### Patch Changes

- 5aa12b8: **Three configs the tool accepted and then failed on.**

  **`architecture.testFiles: []`** — "tests inherit their layer's rules, nothing is exempt" —
  validated, passed `inspect`, and then emitted an ESLint config ESLint refuses to load:
  `Key "files": Expected value to be a non-empty array`. `impact` died on the tool's own
  output. The `testFilename` entry is scoped to your test globs, so an empty list leaves it
  no files: that entry is no longer emitted, and `blueprint rules` says the gate is
  unavailable with the reason, rather than dropping it silently.

  **A config declaring no optional gates** could not run `impact` at all. It loaded
  `@stylistic/eslint-plugin` and `eslint-plugin-import-x` unconditionally — the right trade
  when a gate rides one, since a missing carrier makes an active gate report zero hits — and
  made it even for a repo translating only structural flow, which needs neither. Each carrier
  is now required exactly where a gate uses it, read from the same list `doctor` checks
  against.

  **A CRLF `tsconfig.json`** — the Windows default — fell through to "add these paths
  yourself" instead of getting the alias wired, because the comment-preserving insertion
  matched a bare `\n`. Same repo, different platform, no indication anything had been skipped.
  The line ending is read off the file now, which also keeps the edit from mixing conventions
  into a file your own `@stylistic/linebreak-style` gate would then flag. Two more CRLF
  remnants went with it: handbook table cells no longer keep a stray carriage return, and the
  `.gitignore` re-include block takes the file's own line ending.

- 5aa12b8: **The contract and handbook `init` writes stop naming machines that do not hold their
  rules.** Both are generated from your blueprint alone — they cannot see your repo — and
  they were writing sentences that need to.

  - **No runner is named.** The agent contract told the next agent to fail `npm run lint` in a
    pnpm repo. It says "the project's lint run" now. Where a runner _is_ known — the authoring
    playbook, written by a command that detected your package manager — it stays named.
  - **A gate your blueprint cannot emit is not listed as machine-enforced.** `deepWatch`
    declared on React, or `testFilename` declared beside `testFiles: []`, appeared among the
    rules that "fail the project's lint run" and carried `lint` in the handbook's Enforced-by
    column — for rules the emitted config does not contain. The contract drops them from that
    list; the handbook keeps the row, because the declaration is yours, and names why nothing
    holds it.
  - **Each hard gate says how far it reaches** — only the files a layer glob matches, so a
    declared layer holding no code has nothing that can fail, which is runway rather than
    protection.

- 5aa12b8: **The authoring playbook and the CLI output stopped making claims about your repo they
  cannot check.** This is the bulk of the release: roughly thirty statements that were
  asserted, or that two outputs answered differently, replaced by a measurement, a condition,
  or nothing.

  The ones you would actually notice:

  - **Which build to run is read from your tsconfig graph**, not argued about in prose. The
    playbook used to assert that a Vite + TS starter keeps `vite.config.ts` inside a tsconfig
    project — false on the common starter shape, and it invited an agent to report a verified
    alias edit that `tsc -b` had never read. It now names your file, says whether `tsc -b`
    covers the vite edit, and where it cannot tell, says to go and look.
  - **The build-artifact cleanup instruction reads your repo**: whether `tsc -b` writes
    anything into your working tree at all, and whether ignore rules and version control are
    there — two separate facts, not one axis, with the "decide it yourself" cell reduced to
    the case where nothing in the repo settles it.
  - **`.claude/` is measured before it is described.** The playbook used to tell an agent to
    delete a directory init had created — false on any repo whose owner already uses Claude
    Code, and it now says which of the two it found, including when your own command files
    are sitting in it.
  - **The cleanup list is the same list everywhere it appears**, including the banner that
    opens the document, which named two files where the other three sites named five things.
  - **A finding about a directory addresses the source root your config named**, not a
    hard-coded `src/`.
  - **`impact`'s "not blueprint's rules" block says what those rows are** — a name your code
    mentions in a disable comment that this isolated run cannot resolve, reported at the
    comment. So the count counts mentions, not violations, and it says nothing about the code
    under one.
  - **A re-adoption is told that regenerated wording is a newer build, not drift** — and that
    equal version strings do not rule that out, since a linked checkout, an unreleased tree
    and a git dependency all report the last release while emitting later text.

  The rest are the same shape at smaller scale: a claim that needed a condition got one, and
  a proof step that overstated its reach now states it. Individually none of them changes
  what you do; together they are the difference between an adopting agent writing a true
  report and a confident one. (Where two outputs contradicted _each other_ rather than the
  repo, that is its own entry.)

- b915112: **Four places where two of the tool's own outputs answered the same question differently.**
  Each pair was individually plausible, which is why they survived: the reader only finds out
  by putting the two side by side, and then has no way to tell which one to act on.

  **The handbook's `selfOnly` rule against its own diagram legend.** The legend says a
  **solid** edge is a declared importer relation whose label carries `selfOnly`, and a
  **dotted** edge only records declaration order. The import-discipline bullet twelve lines
  down said "a _dashed_ edge may be depended on but never re-exported onward" — pointing a
  reader at the edges the legend defines as _not_ dependencies, while the genuinely
  constrained solid edge reads as ordinary. The bullet states the rule now and leaves the
  notation to the legend.

  **`blueprint rules` against `doctor`'s survival check, about what that check compares.**
  `rules` closed its per-layer block with "Everything below is what doctor compares" — over a
  block that prints a `packages:` column, while doctor's ✓ says package-ownership entries are
  not compared. Someone folding blueprint's entries into a house config reads `rules`, and
  skips the `--print-config` pass precisely _because_ doctor cannot see that column, so a
  merge that drops a package ban stays green. `rules` names its own columns now: `no-import`,
  `globals` and the selfOnly selectors are compared, `packages` is not, and it says to verify
  that one with `npx eslint --print-config`. **`rules --json` carries the same sentence** on
  each ban entry that has a `packages` column (`bans[i].packagesNote`) — the playbook sends a
  merging agent to `--json` in five places, so that is the channel it matters most in.

  **The agent contract against the handbook, about `cycles`.** One said lint holds it, the
  other `blueprint inspect`. It is `inspect` — a green lint says nothing about cycles — and
  both say so.

  **`blueprint rules` against `inspect`, about how many optional gates exist.** They counted
  differently on a stack that cannot open one of them, with neither naming the discrepancy,
  so `0/17` from one output sat beside eighteen rows from the other. One count now, and the
  row that is excluded says why.

  None of the four is visible from one output, which is why they lasted. So where two of
  them now describe the same boundary, one of them owns it and the others point at it
  instead of restating it in their own words — and a fact that has to reach both the text
  and `--json` travels as one string rather than two copies that can drift apart.

  What that is worth to you: if you still catch two outputs answering the same question
  differently, it is a defect worth reporting rather than a distinction you have to
  arbitrate. Until it is fixed, act on the one attached to the check that produces the
  answer — `doctor`'s ✓ over a description of it elsewhere — and treat the other as the
  one that has gone stale.

- 5218f5d: **The ESLint major `init` resolves you to is now one this project runs its suite on.**

  `init` installs `eslint` unpinned, so you land on the newest major every carrier's peer
  range admits — a field run measured `^10.8.0` arriving that way. Until now, the version
  you land on was the one version never executed here: this package develops against 9,
  and nothing ran 10. Both majors are covered now, and by the whole suite — including the
  scenarios and `impact`, which resolve a real config with a real ESLint rather than
  asserting about one.

  **The install note says so with its channel named**, rather than claiming a bare "both
  tested":

  ```
  → install: eslint, @kekkai/blueprint, … — eslint unpinned, resolving to the newest
    supported major (9 and 10 are both admitted by every carrier's peer range, and
    @kekkai/blueprint's CI runs its own suite on each)
  ```

  The peer-range half leads because it is the half you can check without leaving your own
  `node_modules`, and because it answers what that line is for: whether the install about
  to run resolves at all. The CI half names CI because this package's published
  `package.json` carries `devDependencies` with eslint 9 — and two earlier runs are on
  record opening that file. "Both tested" sitting beside a visible `^9.39.2`, with nothing
  bridging them, reads as the tool contradicting itself rather than as two true things.

  What is deliberately not covered is whether _this_ repo lints cleanly on the new major.
  That is a different question from whether the config blueprint _emits_ still loads there
  and still holds its rules, and only the second one is a promise to you.

- ec418cd: **The lint-merge instruction stopped telling you to widen your own rule.** This is the one
  entry in the release where an output did not merely overstate something — it prescribed the
  wrong edit, and a field agent made it.

  Folding blueprint's emitted `no-restricted-syntax` entry into a house config that already
  sets that key means writing one combined entry. When the two sides' file scopes were never
  the same — a house rule framed at `**/*.vue` against a layer glob of `.{js,vue}`, the
  ordinary case — the playbook said to widen yours to blueprint's glob, and justified it with
  an asymmetry: your rule reaching new files is visible red, blueprint's ban losing files is
  silent, so blueprint's scope wins.

  **The justification is false, and flat config is why.** A config entry does nothing at all
  to a file outside its own `files`, so `...emitLint(blueprint)` goes on enforcing blueprint's
  entry everywhere your entry does not reach. Narrowing yours cannot make blueprint's ban lose
  a file — there is no silent side to weigh against the loud one. Following the instruction,
  an agent widened a date-guard onto a layer's `.js` files and took 38 errors in one test file
  that deliberately relaxes that rule; the correct edit was the narrowing the paragraph warned
  against.

  What the outputs say now, verified with `eslint --print-config` per direction — on both
  ESLint majors CI runs, every cell identical under 9.39.5 and 10.8.0 — rather than reasoned:

  - **The mechanism carries its qualifier.** The later entry replaces the earlier _on the
    files both of them match_ — so only the overlap has to be combined. That sentence was the
    generator: three separate scope claims downstream of it were wrong.
  - **A scope mismatch is resolved by the collision, and neither side moves.** Scope the
    combined entry to where the two globs meet and leave your original entry in place.
    Three entries then cover three sets, and no file gets a rule it never had.
  - **That arrangement is order-dependent, and the constraint sits on the entry you write.**
    The combined one goes last in the array, which is after the spread and after your own
    entry both. Put it above your own entry instead and later-replaces-earlier puts your bare
    rule back on top in the overlap, with blueprint's selectors gone there. Stated the other
    way round ("move your entry up") it would have been a silent replacement of its own: an
    entry lifted over the spread hands blueprint every OTHER rule key it sets, measured on a
    house entry that also set `no-restricted-imports`. Nothing you already had has to move,
    and "last" is said where the instruction to combine is, not only in the scope-mismatch
    case downstream of it.
  - **The verification probe grew the case the new shape needs.** Two `--print-config` probes
    in the affected layer, one inside the collision and one outside, because the recommended
    arrangement deliberately makes files in a single layer resolve different entries — and
    `doctor` resolves one path per layer, which its ✓ already said it does.
  - **The two silent losses are named, and both are about what the entry contains** — leaving
    blueprint's selectors out of an entry that matches its files (doctor's survival check
    reddens), or folding your own original entry away so your rule stops governing the rest of
    what it used to (doctor does not compare the rules you brought, and the print-config pass
    now probes for it).
  - **The `ignores` trade is no longer a trade.** "One entry carries one `ignores`, so a merge
    has to pick" rested on the same premise one paragraph down. Leave the original entry in
    place and the collision's test files keep the house rule after blueprint's exemption lifts
    the combined entry off them, so there is nothing to give up.
  - **The reference page's folding section says the same thing**, in both languages — it
    carried the unqualified mechanism too, and a fix to one copy would have made them
    disagree.

## 3.0.0

### Major Changes

- a2107fd: **Folder layout is entry-only.** `../Sibling` — one module reaching another
  inside the same layer by its public entry — is legal now, on both gates.
  Reaching past that entry (`../Sibling/internals`) is not, and the alias
  spelling (`~app/{ownLayer}/Sibling`) stays banned, so a same-layer edge has
  exactly one shape.

  What changed is a reading, not a principle. Folder layout previously banned
  the entry too, which left a folder layer with no legal way to share at all:
  not relatively, not by alias. The only advice the output had left was
  "extract shared code to a lower layer" — and a shared unit sunk with nothing
  to name it lands in the folder that names nothing, one honest decision at a
  time. That message now points at `../Sibling` instead.

  It also closes a name collision that cost a real adoption. `structure-lint`'s
  `moduleLayout: 'folder'` always meant entry-only; blueprint's `folder` meant
  the neighbour is untouchable. An agent migrating between them carried the
  stricter reading across on the strength of the shared word, and filed fifteen
  imports that had always worked as pre-existing debt. The two now mean the
  same thing.

  Under the hood the two gates stopped being two implementations. `inspect`'s
  `relative-escape` finding and the embedded `blueprint/relative-escape` rule
  both call one `relativeVerdict`, because they claimed to agree by sharing
  resolution primitives and did not — the same `../Sibling` could be legal to
  one and illegal to the other, with no test positioned to see it. The rule
  also receives each layer's entry filename, so a layer whose entry is not
  `index` no longer reads every entry import as reaching past one.

  Same-layer edges now exist, so cycles among them are possible. Nothing new is
  emitted for that: cycles are a property of the graph and `inspect` walks it
  once, where a per-file lint rule re-walks it for every file. A project that
  wants the cycle red at edit time can add `import-x/no-cycle` with
  `ignoreExternal: true` — the carrier already ships.

- 35a7923: **`importBlock` now rides `eslint-plugin-import-x`.** The emitted rule ids
  change from `import-lite/first` / `import-lite/no-duplicates` to
  `import-x/*` — a merged config that overrides either one by name stops
  matching, which is the whole of the breaking surface.

  `import-lite` was chosen when the adoption baseline still included repos that
  `import-x` could not install into: it peers on `@typescript-eslint/utils@^8.56`
  for its resolvers, and a repo pinned below that failed the install as a whole
  (field issue #41), while the original `eslint-plugin-import` caps its eslint
  peer at 9 (#37). On an ESLint 10 baseline that trade reverses. No tree reaches
  ESLint 10 while holding typescript-eslint below 8.56 — older typescript-eslint
  refuses ESLint 10 as its own peer — so the population the guard protected is
  now the repos already installing with `--legacy-peer-deps`, whose installs do
  not abort on peer conflicts in the first place. `ALLOWED_CARRIER_PEERS` records
  that as a deliberate entry rather than a widened hole, and says which
  conformance fixtures would prove it wrong.

  What the resolvers buy is the whole-graph family a resolver-free plugin
  structurally cannot express, `no-cycle` above all. This release does not emit
  it: cycles are a property of the graph, and `inspect` already walks that graph
  once where a per-file rule re-walks it for every file. But a project that wants
  the cycle red at edit time can now reach for it without adding a plugin — and
  with `ignoreExternal` set, since the rule's default walks into `node_modules`
  and a project with no cycles pays the most, having no early exit to find.

### Patch Changes

- deb61a4: **The early-exit checklist says where version control stops.** It closes with
  doctor, and said nothing about committing — while the full method has the
  clause: commit what adoption wrote, and where that is impossible, leave the
  files and say so rather than initializing version control for the owner.

  A field agent on that path went and found the clause in the full method, then
  followed it correctly. It got the right answer by leaving the checklist that
  had just told it "nothing else in this file applies" — a handoff you have to
  go looking for is one the next reader can miss, and the miss here is an agent
  running `git init` inside somebody's directory.

  The checklist now carries it, and says it is a repetition and why.

- e6696af: **`rules` hands over the whole entry, not just its selectors.** Flat config
  replaces same-key entries rather than merging them, so the merge guidance asks
  an adopter to fold blueprint's `no-restricted-syntax` selectors into their own
  entry, and points at `rules --json` for the exact strings. That output had the
  selectors and nothing else — while the emitted block also carries
  `ignores` exempting test files. An entry rebuilt from selectors alone has no
  exemption, so it starts governing tests.

  A field run lost it and spent a debug cycle on 34 errors in one test file. That
  was the loud version, and only because the adopter's own rule happened to
  collide on the same layer. Where nothing collides, the entry that quietly
  reaches test files is blueprint's own selfOnly ban, behind a lint that stays
  green — and doctor compares selectors, not scope, so nothing downstream
  notices.

  `rules --json` now carries `testExemptions` beside the selectors on every
  layer, the text output prints the `ignores` line to paste under the selectors
  to copy, and the playbook's merge section states that an entry is more than
  its selectors, naming both how the loss shows up and how it hides.

## 2.2.0

### Minor Changes

- 4caf8fd: **ESLint now owns formatting in the emitted config, and `maxLines` finally has a unit.** Five new gate ids, all riding a caller-injected plugin so the library keeps zero runtime dependencies. All land at `error` in every preset.

  The load-bearing one is `statementsPerLine` → `@stylistic/max-statements-per-line` at a hard-wired `{ max: 1 }`. `maxLines` counts code lines with blanks and comments skipped, so a line budget with no cap on line _content_ is satisfiable by collapsing statements onto one line instead of splitting the file — the evasion an agent under budget pressure reaches for first. `codeStyle` closes the rest of that route: `@stylistic`'s own `customize()` set (read from the factory, not hand-listed — a hand-picked subset is what left zero-indentation legal) plus `max-len` at 90, `linebreak-style: unix`, and core `curly`, which matters because without it `if (x) return;` counts as one statement and slips past the line gate. Knobs: `indent`, `quotes`, `semi`, `maxLen`.

  Also `explicitAny` → `@typescript-eslint/no-explicit-any` (the mechanical half of the narrow-interfaces principle — `any` is the hole that lets illegal states be expressed), `statementPadding` → `@stylistic/padding-line-between-statements` with a fixed 17-entry list, and `importBlock` → `import-lite/first` + `import-lite/no-duplicates`, which catches the two import mistakes an incrementally-editing agent makes routinely and which no formatter can fix.

  `emitLint` grows `options.stylistic` and `options.imports` beside `options.typescript`; the generated config passes all three, `init` installs `@stylistic/eslint-plugin` and `eslint-plugin-import-lite`, and `impact` loads both from the project so its per-rule counts cover the new gates instead of reporting a silent zero. A gate whose carrier plugin is absent emits nothing while lint still passes — indistinguishable from a clean merge — so the merge snippets, the gate catalog, the playbook and the generated config each state that the options object travels whole. `codeStyle` throws rather than emitting an empty bundle when handed a plugin without `configs.customize()`.

  Three behaviors worth knowing before adopting. The shape family is the **one gate family test files are not exempt from** — a metric threshold screams on a test, but a duplicate import or a collapsed line is no easier to read there. `codeStyle` is nearly all auto-fixable (about 5 of ~68 rules are not), so `eslint --fix` clears most of a first run: the playbook asks for that pass as its own commit, since it rewrites whitespace repo-wide, and notes it cannot push a file over `maxLines`. What `--fix` cannot clear is named too — `max-len` has no fixer and deliberately does not exempt plain strings, because a cap a line escapes by containing a string is not a cap; and a `linebreak-style` red usually means git's `autocrlf` or a missing `.gitattributes`, not the file, so fixing the source just gets undone by the next checkout. Two rules stay rejected on their own merits, and the carrier that ships does not carry them anyway: `import/no-cycle` (a per-file re-check of a graph `inspect` already walks, measured at 92s on 850 files) and `import/no-unused-modules` (cannot run under flat config). Both need a resolver, which is exactly what the shipped plugin leaves out. On a JavaScript project `explicitAny` leaves inspect's coverage denominator entirely — `any` is a TypeScript construct, and a gate nobody can open is not a gate, the rule `deepWatch` already follows on React.

### Patch Changes

- cbd8ae8: **Three field-run corrections to what the tool says about itself.** No behavior changes — but each of these sent an adopting agent somewhere it did not need to go.

  The playbook no longer invites `impact` into the drafting loop. "Let the tools correct you: `inspect` and `impact` are read-only and cheap" sat above the Method as a licence to run both while drafting, and both brownfield agents of the run took it — `impact` lints with the emitted config, so it needs the plugins `init` installs and greeted them with a load error instead. One agent filed it as a self-contradiction, the other blamed itself; the same wall twice is the playbook's, not theirs. The paragraph now names `inspect` alone as the config-only loop tool and states where `impact` joins (Method step 9, after init) and why it cannot come earlier. The load error's own pointer to `blueprint init` — the thing that got both agents unstuck in one hop — is now asserted, not incidental.

  A deletion in `init`'s output no longer wears the writes' `✓`. `− rm:` marks it instead. The note always carried the cause (`pristine preset scaffold — removed; the playbook authors the real one`), but a destructive line stamped with the success mark and buried among writes skims past as one more thing created: a field agent filtered init's output for `write` and missed its own config being reclaimed, then spent commands hunting the disappearance. The mark says which direction the effect went; the note still says why.

  And the install line stops stuttering its own kind — `✓ install: install eslint …` is now `✓ install: eslint …`.

- c420e2a: **A finding now names the rule that carries it, and the `--agent` flag says which path launches anything.** Two field observations, both cases of a correct state reading as a broken one.

  One violation went by three names. `inspect` reported `[deep-import]`, `impact` and the lint run called it `no-restricted-imports`, and an adopter verifying the merge searched the resolved config for `blueprint/deep-import` and found nothing — because that ban, like `flow-violation` and `package-ownership`, folds into the single `no-restricted-imports` entry rather than standing alone. Inspect's migration steps now carry both halves: each names its finding and the ESLint rule that enforces it, and the findings no lint run will ever show — `cycle`, `undeclared-folder`, `no-entry` — say so instead of leaving the reader to wonder where they went. `relative-escape` is called out as the one structural ban that _is_ a standalone rule, since a `../` escape cannot be written as a literal pattern.

  The playbook's `--print-config` guidance gains this as its fourth "know this before reading the output": finding names are not rule ids. It sits beside the three added last release — prefixed keys, rules absent because their layer holds no files, and selfOnly resolving on the importer layer.

  Separately, the README's security bullet was imprecise about `--agent` and two field runs stopped to check. It presented the flag as the one explicit opt-in that runs an agent, without saying that this is true only on the authoring path; on the preset path (`init --preset --agent claude`) nothing is launched and the flag only narrows which contract file is written. Both meanings are stated now, with `init --help` and `--dry-run` named as the authoritative check — which is what both agents reached for.

- 21eeb2f: **The generated handbook stops promising a gate that does not exist.** Its Rules table printed a tier beside every declared rule under one legend — "`error` fails lint" — which is true of most rows and false of two kinds. `cycles` is `inspect`'s finding and deliberately emits no ESLint line; `deadCode` is documentation-only and asks for knip. A preset declares both at `error`, so a stock handbook told its reader that two rules gate their lint run when neither does.

  A field agent caught it by cross-checking against `blueprint rules` and trusted the catalog — at no cost to itself, but it named the real problem: the handbook is the artifact meant to outlive the adoption, read later by people who will not have the catalog open beside it. Two generated artifacts from one source disagreeing is the thing the README claims cannot happen.

  The table gains an **Enforced by** column — `lint`, `` `blueprint inspect` ``, or `documentation only` — and the legend now separates the tier (what the enforcing machine does with a violation) from which machine that is. Unknown ids resolve to documentation, matching how the agent contract already treats them.

  The classification comes from the catalog rather than a second hand-kept list: `GateSpec` gains an optional `runtime` marker, `cycles` carries it, and `enforcedBy()` derives the three-way answer. Adding a runtime-backed gate needs no edit in the handbook, and a test asserts that correspondence rather than the current membership.

- c423c4e: **The last carrier stops constraining the adopter's tree, and doctor's merge check stops over-promising.** Two field findings, both about a green that meant less than it said.

  `importBlock` now rides `eslint-plugin-import-lite` (`import-lite/first`, `import-lite/no-duplicates`). The two predecessors each walled a real repo: `eslint-plugin-import` caps its eslint peer at 9, and `eslint-plugin-import-x` peers on `@typescript-eslint/utils@^8.56` for resolvers these two rules never use — an optional peer is still version-checked when the package is present, and no nested copy can satisfy a peer, so a repo pinned at 8.47 could not install it at all. Since npm resolves the required-deps list as a unit, either one failed the whole install. import-lite is those same rules ported without the resolvers: zero dependencies, `eslint` as its only peer, and behaviour verified identical across eleven cases including the TypeScript one that matters (`import type` beside a value import from the same module stays legal). No release ever carried the old ids.

  The peer guard widened with it. It already asserted every carrier admits each supported ESLint major; it now also asserts no carrier peers on anything _else_ the adopter owns, since that is the constraint that actually failed. `typescript-eslint` ↔ `typescript` is allowed by name; a new peer is a test failure to review, not a surprise in someone's adoption.

  Doctor's merge-survival check no longer walks past the failure its own playbook warns hardest about. It verified structural rules only — bans, selfOnly selectors, globals — while printing an unqualified `✓ emitted rules survive the merged eslint config`. A field agent removed the `stylistic` argument from a merged config, exactly the "dropped plugin argument" the docs spend the most words on, and watched `npm run lint` pass, doctor pass, and the entire ~68-rule `codeStyle` family disappear. The check now also resolves one representative rule per declared carrier-backed gate (`codeStyle`, `statementsPerLine`, `statementPadding`, `importBlock`, and `explicitAny` on TypeScript projects) and reds when a gate is on but its rule resolved to nothing, naming the missing `emitLint` argument. A gate turned off in the config is not expected — which makes "we keep our own formatter" a declared decision rather than a silent drop.

  The ✓ also states its scope now (`structural bans + each active gate's carrier rule; thresholds and package-ownership entries are not compared`), and the playbook names the step two separate field runs invented on their own: `npx eslint --print-config <a file inside a layer>`. A passing lint proves the config loads, not that a rule reached a file — and on a repo whose layers hold no files yet it proves only that the config parses.

- 052586f: **`init` no longer claims effects it did not produce, and its dependency list installs on ESLint 10.** One field report filed these as two findings; they are one causal chain, and either half alone still ships a broken repo.

  `importBlock` moved off `eslint-plugin-import`. That package's peer range stops at ESLint 9 while the current ESLint is 10, and `npm install` resolves the required-deps list as a unit — so on any ESLint 10 project the whole install failed and not one plugin landed. This release settled on `eslint-plugin-import-lite` as the replacement (see the entry below for why the first attempt, `eslint-plugin-import-x`, was itself walled); `importBlock` has never appeared in a release, so no ledger carries any of the earlier ids.

  A new guard keeps the class closed rather than the instance: every package in the required-deps list is a devDependency here, and a test reads its actual peer range and fails if it excludes any supported ESLint major. The capped dependency that ships next fails in this repo instead of in someone's adoption.

  The narration is the other half. `init` used to print its entire plan with `✓` and apply it afterwards, so a step that threw left an output vouching for every effect below it. The install sits mid-plan with the alias writes beneath it: an adopter on ESLint 10 read `✓ write: vite.config.ts (import alias added — existing content preserved)` over a file nothing had touched, and the agent contract it shipped promised a `~app` alias that resolved nowhere. `doctor` caught it — but only after the lie, and only for someone who thought to ask. Effects are now announced as they land, the step that fails wears `✗`, and the error names the planned effects that did not happen plus two ways to finish: re-run `init` (idempotent — applied effects stay), or `init --no-install` to complete the file plan and install the printed deps by hand.

- a7ff535: **The merge instruction stops walking into the trap it opens with.** A field run on a Vue repo with a `selfOnly` layer declaring two importers found that "combine both option sets into ONE entry" is written for a single collision and misleads on several.

  `emitLint` scopes its entries per layer, so one rule key can own more than one. A `selfOnly` layer with two importers emits `no-restricted-syntax` on **both** importer layers, and a house rule may overlap only one of them. Read literally, the instruction leaves two exits and both are wrong: widen the combined entry to cover the other layers and your rule now governs files it never did (a visible new red — the run's repo had hard-coded date literals waiting in the second layer), or narrow it to exclude them and flat-config replacement deletes their emitted ban while lint stays green. That second one is the exact failure the same paragraph warns about two sentences earlier.

  "ONE entry" now says it means one per _collision_, not one per rule key: combine with the entry you actually collide with and leave the others exactly as emitted. `npx blueprint rules --json` is named as the way to see the emit points before merging rather than after — two importers show up as two. And since a warning that only says "be careful" is not much of one, the paragraph also names the gate behind it: doctor's survival check probes every layer separately and names the layer that lost its selectors, so the silent branch is not silent at the acceptance gate.

- 12cc5b8: **The `--print-config` step earns its place, instead of duplicating a gate and surprising the reader.** A clean field batch — no blockers in six reports — whose only friction was the instruction added one release earlier.

  That step arrived in the same change that widened doctor to verify carrier survival, so the playbook was asking for a hand sweep the gate already ran. Two runs noticed the overlap and said so. It now points at the remainder doctor's ✓ explicitly does not compare — thresholds, package-ownership entries, and the survival of the rules _you_ brought to the merge — and says outright that printing configs by hand is not needed on the early-exit path.

  It also names the three ways a correct config reads as broken through that command, each of which cost a field agent a detour: resolved keys carry their plugin prefix (`@stylistic/max-len`, never bare `max-len`); a rule scoped to a layer holding no files does not appear at all, which is inspect's `declaratory-self-only` note rather than a loss; and `selfOnly`'s re-export ban resolves on the **importer** layer inspect names, not on the layer being protected.

  The gate catalog stops disagreeing with that output. `codeStyle` listed its extras bare — `max-len`, `linebreak-style` — while the resolved ids carry the `@stylistic/` prefix and only `curly` is core. An agent cross-checking the catalog against `--print-config` read the mismatch as two missing rules. Every other catalog row already printed resolved ids; this one now does too.

  Finally, the playbook says why the carriers install when no gate from their families is declared — three separate runs paused on it. They sit inert until a gate names them, and installing now makes enabling one a single-line config edit instead of a config edit plus an install plus a second pass over the merge, months later, by someone who was not there.

## 2.1.0

### Minor Changes

- 003cacc: Drop the "backend boundary" posture from the emitted handbook. The `respect-backend` core belief and the whole "Data integrity & backend boundary" playbook section (`no-fake-fallback`, `drift-guard-framing`, `no-fe-workaround`, `preserve-locale-shape`) no longer ship in the presets, the handbook, or the agent contract.

  No API surface changes — `PrincipleDef` and `PlaybookSection` are untouched. The preset data is simply nine beliefs and a three-section playbook now (was ten and four). Re-run `init` to regenerate a handbook and agent contract without the section; a repo that authored its own `principles` / `playbook` is unaffected.

- 7dcbe82: Drop CI scaffolding. Blueprint no longer emits `.github/workflows/blueprint-ci.yml`, and the `emitCi` export, the `CiOptions` type, and the `emit.ci` config field are removed.

  Verification strategy is the adopter's call — a git hook, GitHub Actions, GitLab CI, whatever you already run. Blueprint still ships the verification _commands_ (`inspect --baseline`, `doctor`) that exit non-zero on new findings; wire them into your own gate.

  Migration: remove `emit.ci` from any `blueprint.config.mjs` (it is now an unknown key, so `init` rejects it), and move the two steps the emitted workflow ran — `eslint` and `blueprint inspect --baseline` — into your existing pipeline.

  Shipped as a minor by the owner's call: strictly this removes public surface, but that surface existed for days on 2.0.0, nothing in the field ever used it, and a config still carrying `emit.ci` fails loud with the pointed unknown-key message above — not silently.

- ab134f4: `architecture.module` is optional — the playbook's "flat default" is now real (field issue #23): omitting the block, or any of its keys, resolves to `{ layout: 'flat', entry: 'index' }` through one shared reader, and an empty `entry` still fails loud with the default named as the way out. Validation used to demand `module.entry` while Method step 5 said plain files take the flat default — the field agent burned two edit-run cycles proving the tool contradicted itself.

### Patch Changes

- ab134f4: Judgment calls agents kept making unaided, now stated where they arise (field issue #23): `rules` says the fold's message text is yours to write (doctor verifies selectors, never messages); a house rule under a different KEY with the same semantics never collides — keep one gate per semantic; an `owns` candidate the intent documents never mention is a proposal for the report, not a clause to encode; annotating a bare disable's reason is a comment edit inside the adoption boundary; everything the adoption produced — config, artifacts, both ledgers — is meant to be committed, and initializing VCS is never the agent's call; the CLAUDE.md discipline pointer notes the contract ships inside the package.
- ab134f4: init's vite alias instruct respects a tsconfig-paths bridge plugin (field issue #25): with vite-tsconfig-paths in the vite config, the tsconfig side init already wires covers the bundler, and doctor's alias check passes that state — init no longer demands a redundant `resolve.alias` the check never asks for, and the instruct itself names the bridge-plugin escape hatch when it does fire.

  Contract references ship WITH their `BLUEPRINT:START/END` markers (field issue #26): the reference's header said "init rewrites only between the markers" while the file carried none — the agent probed raw bytes, guessed headings were markers, and the integrated block went permanently stale (a wrong layer flow in CLAUDE.md, invisible to doctor). Pasting the reference verbatim now keeps the block refreshable by any later init; both integration instructs state the trade — keep the markers and init refreshes the block, strip them and the file is yours to update by hand, forever. Also from the same batch (#24–#26): the build-verification artifacts are named as the build's normal output, not adoption leftovers; ongoing enforcement is stated as deliberately unscaffolded (the gate commands are the deliverable, the pipeline is the owner's); linearization prefers the smallest-relaxation position among equally legal ones; a skipped parser block's package is dependency wiring to keep, not waste.

- ab134f4: Closing-round polish from field issues #27–#28 (zero blockers across four scenarios): the survey's "Same-folder imports via the alias" section always prints — an explicit `0 (none found)` instead of a silently absent row the playbook cites; the one-gate-per-semantic rule now spans gate layers (a house `import/no-cycle` and the inspect-side `cycles` gate are one semantic — pick one detector); the `owns` sketch states that repeating the same entry across layers IS the shared-allowance syntax (same-signature entries merge).
- 049b1fa: The playbook states doctor's leftover criterion — exact file families (the playbook, the command file, `*.blueprint.*` references, marker-bearing contracts outside `emit.agents`), never other files whatever their names. Two field runs verified this experimentally by writing a file and re-running doctor (issues #27, #32); the answer now sits in the semantics section instead.
- 325379e: The anti-bypass guard's files glob scopes to the detected stack's extensions, like the parser blocks — a react repo's guard used to carry `.vue`, and four field runs trimmed it by hand (field issue #30); an unknown stack keeps the full set, and the glob honors `sourceRoot`. The guard's comment also states that its position relative to the emitLint spread does not matter (the rule sets never intersect) — the one merge-order doubt agents kept resolving themselves.
- ab134f4: The merge instruction meets the agent at the point of need (field issues #21–#22): an existing `eslint.config.ts` gets the TS7016 caveat — importing `./blueprint.config.mjs` needs `allowJs` on the tsconfig covering the config, or a one-line `blueprint.config.d.mts`; `defineConfig([...])` arrays are named spread-equivalent; the generated jsx parser block carries its own skip criterion (dormant on a TS-only repo).

  "Only a real run proves it" now covers the alias wiring (both runs added the build check by hand): the early-exit checklist and the merge step order one build run after init edits tsconfig/vite, stating why — doctor's alias check reads wiring as text, never as a compile. The contract header now says hand-written notes live outside the marker block, the convention an agent had to infer when the generated file became the repo's only CLAUDE.md.

- ab134f4: An additional alias whose target sits above the source root now really joins the bans (field issue #29): `'~root': '.'` used to emit `~root/<layer>` patterns no real import ever used — the whole `~root` leg of every structural ban was a silent no-op, inspect was equally blind to `~root/src/<layer>` imports, and a closing report almost claimed a protection that did not exist. Emit and inspect now derive each alias's layer base from one shared helper with the target offset baked in (`~root/src/views/**`, selector `^~root\u002Fsrc\u002F…`), so patterns and findings cannot disagree; an alias into a subfolder has no layer surface and carries no layer bans, and the playbook says so.
- ab134f4: Playbook verdicts agents had to invent, now stated (field issues #18–#20): the report is a message — the closing reply or the PR description, never a committed file — and the early-exit path says its one-line verdict IS the report; the early-exit wiring step closes by running the project's own lint once (doctor's wired check reads config text and never executes eslint, so a load-time crash sailed through all seven checks); the `owns` sketch notes `pattern: true` globs match any import specifier, internal alias paths included; init's preset hint carries `--agent`, matching the checklist it hands off to.
- ab134f4: selfOnly re-export selectors encode `/` as the `\u002F` regex escape: esquery below 1.7 has no `\/` escape in its regex literal, so the emitted selector truncated to a broken pattern and crashed ESLint — and `blueprint impact` — on every file of the selfOnly importer's layer, wedging doctor's survival check against the lint gate (field issue #19). Doctor's survival red now names both possible causes (a replacing flat-config entry, or a hand-folded copy that drifted from this version's output) and points at `rules --json` for the exact selectors, instead of asserting a merge collision that may not exist.

  `rules` (text and `--json`) carries the exact `no-restricted-syntax` selector strings a selfOnly merge fold needs, per layer and target: the playbook demands "combine both option sets into ONE entry", and the only source for the selectors used to be an emitLint dump — exactly the bundle archaeology the same playbook forbids (field issue #20).

## 2.0.0

### Major Changes

- 33ed541: 2.0.0 — the field-hardened release. Fifteen autonomous adoption rounds
  (closed `field-run` issues #1–#15) drove every change since 1.14; the
  loop converged when a full round reported zero tool defects, with every
  suspicion an agent raised verified against the channels and retracted.

  Breaking changes:

  - **Config validation rejects unknown keys** across the structural path
    (blueprint, architecture, layers, allowedImporters entries, module,
    owns entries, emit). A key nothing reads was a silently dead
    declaration — a field repo shipped a `selfOnly` ban that never existed
    because the key sat one level too high. Configs carrying stray keys
    now fail loud with a pointed message.
  - **`architecture.flow` and `emit.lint.path` are removed** (both were
    inert), along with the `retire` command, the `--framework` flag on
    `impact` / `doctor` / `rules`, and the never-documented entry exports
    `emitAgentContract` / `AgentContractOptions` / `injectBetweenMarkers` /
    `StructuralRule`.
  - **`doctor` is stricter**: leftover authoring artifacts
    (`blueprint-authoring.md`, the command file) fail the leftover check —
    "Adoption complete" and the playbook now define done identically; a
    marker-bearing contract outside `emit.agents` already failed since 1.14.
  - **The emitted CI workflow gates with `inspect --baseline`** (a missing
    ledger is an empty one) — locked brownfield debt no longer turns the
    tool's own CI permanently red.
  - **`architecture.module.private` is optional** (omitted = none) — the
    one loosening.

### Minor Changes

- 4fe2d55: Product-wide chicken-rib sweep — dead surface is gone, not deprecated:

  - `architecture.flow` removed. It was a required field that nothing ever
    read — the layer ORDER is the flow. Existing `.mjs` configs keep working
    (the runtime ignores unknown properties); TypeScript-typed configs delete
    one line.
  - `emit.lint.path` removed for the same reason: never consumed, while its
    doc claimed a consumer.
  - `emitAgentContract` (and `AgentContractOptions`) left the package entry:
    the supported agent targets are the ones `emit.agents` names, and a
    render-it-yourself hatch for unsupported tools is surface without a
    mission. `emitAgentFiles` remains the one distribution API.
  - `injectBetweenMarkers` left the package entry — an internal merge utility
    with no documented story.
  - `plugin` stays, and its story is now stated in the reference: the escape
    hatch for hand-wiring a `blueprint/*` rule without `emitLint`.

- 538578b: `doctor` and the playbook now define "done" identically (field issue #13):
  the leftover-files check also flags `blueprint-authoring.md` and
  `.claude/commands/blueprint-author.md` — "Adoption complete" over a live
  playbook was a second, contradicting authority, and a careless agent
  stopped there. The check's detail says a mid-authoring doctor run is
  EXPECTED to fail on it; the early-exit checklist and acceptance gates now
  order cleanup BEFORE the final doctor run. Gate turns stricter: repos
  that finished wiring but skipped the playbook's cleanup step go red until
  the two files are deleted.

  Also: the `missing-layer` note carries the keep-is-default verdict in
  place ("runway, not a todo … slimming is the owner's call") — six of
  these read as a todo list and pointed an agent at dismantling the preset
  skeleton the playbook says to keep.

- 6c5af1c: Field issue #4 (489-file brownfield run, structure-lint retired per the
  playbook): unknown CLI flags now fail loud instead of being silently ignored
  — `inspect --verbose` read as a broken no-op to an agent; init re-includes
  its gitignored artifacts by appending `!` negations to .gitignore itself
  (with the parent-directory caveat stated in the note) instead of handing the
  fix back; the rule catalog now states what two agents had to eval the bundle
  to learn — `owns` covers named-import granularity (a house "only composables
  may inject" rule maps to it), `no-restricted-syntax` is emitted only when a
  selfOnly importer exists, and `additionalAliases` join every structural ban;
  the playbook's retirement clause says to DELETE the retired tool's config
  and that source-comment pointers may outlive the sweep under no-source-edits;
  impact's echoes block leads with "NOT blueprint findings, NEVER counted".
- f7bc5d9: Field issue #5: `init --agent claude` now PERSISTS the choice — a scaffolded
  config carries `emit: { agents: ['claude'] }`, so the first run emits one
  contract and the next plain init cannot grow the second one back; the
  chicken-and-egg (config must exist before you can narrow it) is gone. The
  catalog closes the last bundle-eval of the round: `unusedVars` is named as
  TWO rule keys on TypeScript, every optional gate is stated to scope to the
  layer globs only, and merge guidance says collisions are decided by rule
  KEY (`blueprint rules --json` names them), not by hit count.
- 5337f77: Field issues #2–#3 (automated harness runs): doctor's leftover check now
  also flags stale agent contracts — a marker-bearing CLAUDE.md/AGENTS.md/…
  outside the emitted `emit.agents` set cannot hide behind green (init removes
  a wholly-generated one itself; a hand-touched one only got an instruct, and
  nothing gated the orphan afterward). A preset that introduces the repo's first import
  alias names it as a decision instead of letting a new convention pass
  silently. init --help stops promising layer folders unconditionally and says
  plainly that --agent never launches anything on the preset path.
- a3aa5a8: Field issues #7–#8: `blueprint rules` gains the resolved per-layer view —
  what each layer may not import, which owned packages (down to named imports)
  and globals are banned there — ending the `eslint --print-config`
  archaeology behind "0 hits: wired-and-clean, or not applying at all?". The
  playbook's early-exit verdict becomes a complete self-contained checklist
  ("following this verdict IS executing the playbook fully"; impact's zero
  gates the suppress-all run; trivially-true acceptance gates are named as
  such; the now-empty command directory goes too), the config schema's full
  `owns`/`additionalAliases` shapes live in the playbook so nothing exists
  only in dist, the test-file exemption is named as a deliberate relaxation
  versus tools that police tests, and a below-threshold `--authoring` run
  says up front that the playbook's own verdict will be the early exit. All
  adoption prompts state that an early exit the playbook prescribes counts
  as full execution.
- 99a0727: Init now lives by its own doctrine (field batches 10–11): empty layer folders
  are scaffolded only into an empty source tree — where code already lives, an
  unbuilt layer's absence is its true state, no `.gitkeep` shells. Narrowing
  `emit.agents` makes the next init remove a stale agent contract that is
  wholly its own output (nothing outside the marker block; own-strategy rule
  files by construction) — a hand-edited file only gets told. And
  `validateBlueprint` now returns the blueprint instead of `void`, so a passing
  call is visible at runtime.
- 1e077f1: A config key nothing reads now fails validation instead of dying silently
  (field issue #14): a 489-file field repo declared `selfOnly: true` on the
  layer object — where nothing reads it — and the intended re-export ban
  never existed while every gate stayed green. Validation now rejects
  unknown keys across the structural path (blueprint, architecture, layers,
  allowedImporters entries, module, owns entries, emit), and the misplaced
  `selfOnly` gets a pointed error naming its real home
  (`allowedImporters: [{ layer: 'views', selfOnly: true }]`).

  `blueprint rules` also answers "does THIS config emit it?" for the
  structural family: each rule carries a per-config `✓ emits / · not
emitted` annotation (`active` in `--json`), so nobody has to probe
  emitLint to learn whether their `no-restricted-syntax` will collide with
  a house rule. A test pins the annotation to emitLint's real output.

- 514eb53: Presets take `emit` directly and merge it over their day-1 default
  (`ci: 'github'`). Declaring the agent tool in use is the first customization
  nearly every adoption makes — it no longer costs the one-line preset form,
  and no longer silently drops the CI workflow the way a spread-level `emit`
  override does.
- 62ddb7e: `architecture.module.private` is now optional — omitting it means no
  private parts (`[]`). A draft-first config that never mentions private
  sub-parts validates instead of failing with "must be an array" (field
  issue #11). Explicit `private: []` keeps working unchanged; a non-array
  value still fails loudly. The playbook's schema sketch marks the field
  optional.
- 0ee89bf: The tool now answers for itself (field batch 12): `blueprint rules` prints
  the emitted-rule catalog — always-on structural rules, optional gates with
  metric defaults, documentation-only ids — annotated with the config's
  declared tiers and whether each gate emits today. `inspect` gains the tenth
  finding, `declaratory-self-only`: a selfOnly ban protecting a layer with no
  files is named as a blank round until code lands. The authoring playbook
  additionally licenses draft-first authoring — write the config early and let
  read-only inspect/impact runs correct it, instead of studying the archive
  first — and carries the retirement sweep for a consolidated-away tool.

### Patch Changes

- `impact`'s zero-hit line states its own reach: "no red today" is an
  emitLint claim, and the anti-bypass guard rides in the generated config
  outside impact's scope — its findings (bare eslint-disables) surface in
  the project's own lint. The playbook's "zero hits → skip
  `--suppress-all`" carries the same carve-out (field issue #17: 0 hits,
  then five guard findings in the real lint run).
- e59c662: Init UX honesty (field batch 10): re-running init no longer re-instructs alias
  wiring it already did — JSONC tsconfigs are checked through the tolerant parse
  before "unparseable", and the vite instruct respects doctor's quoted-token
  wiredness standard (now shared as `quotedIn`). A below-threshold authoring
  playbook leads with the early-exit verdict instead of burying it mid-method.
  The vacuous-net callouts name the concrete next step that arms the net, and
  the both-contracts note surfaces that `--agent claude|codex` already narrows
  the emitted contracts.
- 963cfa9: Field issue #9 — the early-exit checklist honors its own completeness claim
  on every repo shape: step 1 carries the tool declaration (`init --preset
--agent claude|codex` persists into `emit.agents`, one run emits one
  contract); step 2 verifies `inspect --baseline`; the false guarantee "no
  reference file is ever written" is replaced by the conditional truth — a
  repo with its own eslint config DOES get a reference, and the checklist now
  carries the merge-and-delete step for it. The anti-bypass guard's plugin is
  provisioned on every path again: with ADOPT as the stated default, an agent
  following it must not hit "Cannot find package" — dropping the block is the
  exception, and the guard says to remove the dependency with it.
- f79d7cb: The emitted CI workflow now gates with `npx blueprint inspect --baseline`
  instead of plain `inspect` (field issue #10, live-verified). A missing
  baseline is an empty one, so greenfield behavior is unchanged — but locked
  brownfield debt no longer turns the tool's own CI permanently red, which
  contradicted both `inspect --help`'s CI example and the playbook's ratchet
  model. `inspect --update-baseline`'s no-debt messages now point at the
  `--baseline` CI line too, instead of telling the reader plain `inspect` is
  the gate, and the compact agent contract's verify line prescribes
  `inspect --baseline` for the same reason — red only on findings the agent
  itself introduced.
- 07818a5: Every starter field run re-derived "why adopt on an empty repo at all" in
  its judgment section — the answer (adopt early; the contract's value is
  highest before the first violation exists) lived only on the docs site,
  which an adopting agent never reads. The below-threshold playbook verdict
  now carries the doctrine in place: emptiness is the point, not a smell;
  the expensive version of this repo is the one that adopts two years and
  400 files later.
- 6576485: Zero-debt doctrine, lint side (first live field-harness catch): running
  `eslint --suppress-all` on a clean lint writes an EMPTY suppressions ledger
  — asymmetric with the baseline, which writes no file on zero debt. Doctor's
  suppressions check now names the empty ledger as ceremony and says to delete
  it; the playbook's ratchet clause covers it explicitly; every adoption
  prompt (README, docs, field prompt) scopes the lock commands to "only when
  debt exists".
- 8efd576: Field issue #1 (first automated harness run): init's alias notes say the
  edit's shape in place — "import alias added — existing content preserved" —
  instead of a bare "write" that reads as a rewrite; a fresh scaffold with no
  lint script gets one (`"lint": "eslint <root>"`) so local lint matches the CI
  gate, and an existing project gets told; the playbook states the runway
  stance — a preset's declared-but-empty layers (and a not-yet-used alias) are
  declared intent, not a manufactured net, so keep them unless the project
  will never grow into them; the adoption guide notes which acceptance clauses
  resolve vacuously (no tests, zero debt) and that this is correct.
- cdfc99d: Field issue #6 — three message-level frictions, zero behavior bugs: the
  eslint merge hints now put `...emitLint(blueprint)` AFTER your existing
  entries and say why (later entries win in flat config — the old hint walked
  you into the exact override trap the playbook warns about); the generated
  config's parser blocks carry a header saying they are live-config-only and
  should be skipped when merging into a config that already wires parsers;
  survey prints "— none —" under empty sections instead of a bare heading
  that reads as a render failure.
- a4d7be9: Three field-verified message defects, one class — an output that
  contradicts its own doctrine or prose (field issue #12):

  - `impact` now names a vacuous zero: when the layer globs match no files,
    "0 hits" says so and adds "proves nothing until code lands in a layer" —
    matching `inspect`'s coverage warning instead of reading like the rules
    ran clean. `--json` output carries the new `linted` count.
  - `init`'s eslint wiring snippet on a TypeScript repo IS the TS version
    (`emitLint(blueprint, { typescript: tseslint.plugin })` with its import)
    instead of a JS snippet corrected by prose four lines later.
  - `init --authoring`'s hand-off line promises "locking a baseline if debt
    exists" — the sub-threshold early exit locks nothing, and the old
    unconditional wording contradicted that prescribed path.

  Plus two recurring field doubts encoded where they arise: the early-exit
  checklist now says to remove `.claude/` itself when deleting the command
  leaves it empty, and the reference's parser-setup header names presets
  that wire parsers internally (tseslint.configs.recommended) as "already
  wired".

- a3d33f1: One story per state — sibling tools stop contradicting each other (field run #10):

  - `doctor`'s architecture check only says "findings covered by the baseline"
    while a baseline is actually covering something. On a truly clean repo the
    label is plain `architecture clean` — matching `inspect --update-baseline`'s
    "no baseline needed" instead of claiming a ledger that does not exist. The
    red detail likewise drops "outside the baseline" when no baseline is in play.
  - The size gate has one name and one number everywhere: `init`'s forced-
    authoring log line and `init --help` now say "brownfield threshold
    (10 source files)" — the playbook's term — instead of the unnumbered
    "preset threshold".

- 3df2615: The five judgment items every field run re-derived now carry the owner's
  verdicts in the agent-facing channels, so they stop being open questions:
  keeping the preset's declared-but-empty layers is the DEFAULT (slimming is
  the project owner's later call, never the adopting agent's); the `~app`
  alias is deliberate — `@` is npm's scope sigil, and an app alias should not
  look like a package scope (the init note stops suggesting `@` as an
  alternative); a repo with no tests passes the tests clause vacuously (every
  adoption prompt says so); the eslint-comments block is named for what it is
  — the anti-bypass guard against silent disables, default ADOPT, dropping is
  the justified exception; and `emit.agents` declares the tool RUNNING the
  adoption — never a guess at future tools.
- 7aadb8f: Removed the inert `--framework` flag from `impact`, `doctor`, and `rules`
  (and the corresponding option from their TypeScript options types). All
  three commands require — or resolve — an existing config, and `framework`
  only ever steered the no-config preset fallback, so the flag never had any
  effect; documenting it was a lie waiting to confuse an agent. `init`,
  `inspect`, and `deps` keep theirs — there the no-config path is real.
- 94d8776: Adoption honesty from field batch 12: the authoring playbook now carries a
  full rule catalog (always-on structural rules, optional gates with their
  metric fallbacks interpolated from the source, documentation-only ids) so no
  agent reads the minified bundle again; impact's foreign block names itself as
  echoes of your own config and the closing line says numbers decide tiers, not
  just suppressions; the playbook warns about structure-lint's `{folder}` token
  and tells the agent to sweep a retired tool's stale footprint; the generated
  eslint companion block states its scope (JS/TS disable comments only).
- f45c23d: The mission statement enters the agent channels. Blueprint exists to keep
  AI-driven development inside the declared architecture — the strictness is
  the product, and the agent reading the contract is its subject. The
  contract header now says so on every emitted target ("never soften or
  bypass; disagreements go to the maintainer"), and the playbook's Goal
  section tells the adopting agent that the urge to soften a tier or leave an
  escape hatch is exactly what the tool exists to catch: install faithfully,
  put disagreements in the report.
- d637584: The survey's "Same-folder imports via the alias" count is now stated for
  what it is — a textual upper bound, not a promise (field issue #11: the
  playbook called it "exactly how many errors the wiring will introduce",
  and a 489-file field repo proved it 5 ≠ 0 against `impact`). The count
  includes test files (exempt in the emitted config) and non-static
  references (dynamic imports, mock specifiers, doc comments) the wired
  rules may never flag. Both the playbook's pre-wiring check and the survey
  heading now say so and point at `impact` for the real per-rule number.

## 1.14.0

### Minor Changes

- bc55a63: Doctor's merge-survival check no longer goes blind on empty repos — the anti-false-green gap field batch 7 called ironic. A layer with no files yet gets a synthetic probe derived from its own globs (`calculateConfigForFile` resolves by pattern and never touches the filesystem), so a gutted config turns red with zero files on disk; globs the synthesis cannot honor simply yield no probe. The authoring playbook gains an early-exit clause: on a repo at or below the preset threshold whose shape a preset fits, `init --preset` is a legitimate verdict — walking the full method on a starter is ceremony, not judgment. Docs show the `{ ...reactPreset(...), emit: {...} }` spread, since `emit` is a top-level blueprint field, not a preset option.

### Patch Changes

- 5d45120: Layer names carrying glob or path characters are rejected at validation — a layer literally named `*` (field batch 9's root-files workaround) widened every file glob into a wildcard and scaffolded a literal `src/*/` folder. The playbook states the doctrine the workaround violated: an empty net on a root-only app is the true state, not a failure — never invent a layer to make coverage non-zero; root-file hygiene belongs to the project's own lint.
- 9a5b15a: Batch-8 field fixes, all with repros. `usePrefix: 'off'` no longer validates its target layer (an off rule has nothing to target — it used to throw on repos without a `hooks` layer). `impact` stops contradicting itself: `parse-error` and `unused-disable-directive` move out of the wiring-red total into an "Isolation caveats" section that says which kind vanishes after the merge and which survives. The handbook diagram renders order-only spine edges dotted and declared importer relations solid with inline labels — consecutive leaf layers chained solid read as dependencies they never were. The playbook's overlapping-tool guidance gains its missing exception: when the existing tool sets the same ESLint rules emitLint emits, coexistence is mechanically impossible and consolidation becomes a wiring precondition, not a scope decision to flag.
- 6464b43: Scanned paths normalize to forward slashes at birth — on Windows every downstream glob net (inspect, coverage, survey, survival probes) silently matched nothing. Layer-name validation also rejects characters that corrupt the emitted mermaid diagram (whitespace, quotes, parens, `&`, `%`, `;`) while keeping real conventions like `@core` valid; pipe-bearing edge descriptions render as `/` instead of breaking the inline-label syntax; and the playbook's deliverables and acceptance gates go zero-debt-conditional — a clean repo's absent baseline is the correct outcome, not a stalled checklist item.

## 1.13.0

### Minor Changes

- 40d9b0a: Clean-repo honesty round, from two zero-debt field adoptions. tsconfig reading (doctor's alias check, survey's alias detection) now parses JSONC — the Vite + TS starter ships commented tsconfigs, so JSON-or-bail false-redded the mainstream path. `impact` labels rows whose rule id is not in the emitted config as isolation artifacts (existing disables referencing the project's own rules), renders them apart, and excludes them from the wiring-red total. `inspect --update-baseline` no longer records info findings — a missing-layer note is "not built yet", not debt; an all-info repo converges to "no baseline needed" instead of inviting manufactured debt.
- c729157: `doctor` gains a seventh check — the emitted rules must survive the merged eslint config. Flat config never merges a rule two entries set: a later entry silently replaces blueprint's structural bans (or the user's own defenses) while lint stays green — two field runs hit this from both directions and caught it only by hand. Doctor now resolves the project's final config for a real layer file via the project's own ESLint and names exactly what was lost (structural pattern groups, selfOnly selectors, restricted globals, the embedded relative-escape rule); unreachable preconditions skip with a labeled reason instead of failing. The playbook's wire-the-lint step upgrades accordingly: a rule both sides set must be combined into one entry — ordering alone cannot save it.

### Patch Changes

- 40d9b0a: Playbook and docs close the zero-debt gaps: flat-config merge trap stated (same rule in a later entry replaces the earlier — spread `...emitLint` before your own blocks and re-check shared rules), the generated reference marks the eslint-comments block as a companion rather than emitLint output, zero findings is named a complete outcome (never manufacture debt to demo the ratchet), intent-doc DAGs get a linearization hint, and the adoption prompt plus scope-honesty docs set greenfield expectations — on a clean repo the value is forward-looking, not a bug harvest.

## 1.12.0

### Minor Changes

- e8b2ba1: `doctor` gains a sixth check — the declared import alias must be resolvable by the toolchain (tsconfig `paths`, or a bundler config: vite / webpack / vue-cli / next / rsbuild, matched as a quoted token), closing the declared-yet-unwired gap where the agent contract points at imports nothing resolves. `inspect` reports and doctor's architecture check now state their coverage (source files inside layer nets, active optional gates), so a vacuously green gate over an empty net is called out instead of quietly passing. `detectAliases` moved from `survey` into `project` alongside the new `pathAliasKeys`.
- 2d55589: New `blueprint impact` command — the rule-impact dry-run. It compiles the authored config with `emitLint`, runs the project's own ESLint over the layer files with only that config, and reports what wiring would flag today: hits per rule, heaviest files named, and two honest special rows — `parse-error` (a file could not be parsed; its numbers are untrustworthy) kept apart from `unused-disable-directive` (a stale inline disable that suppresses nothing; the file is fine). Informational, never a gate (exit 0 whatever the count). The authoring playbook now points to it in the wire-the-lint step, so rule conflicts get decided on numbers instead of reverse-engineering the emitted config by hand.

### Patch Changes

- dacc70a: Authoring playbook now states the emitted-rule semantics up front (flat vs folder same-layer imports, the pre-wiring "Same-folder imports via the alias" count, `unusedVars` options, doctor's "wired" criterion) so agents stop reverse-engineering them from the bundle; intent-document translation gains a stale-clause downgrade rule; the survey import matrix notes that it counts test files while inspect does not.

## 1.11.0

### Minor Changes

- 321701c: Turn it red, then ratchet it — the debt posture flips, and the plain-init
  poison path is fixed. Both from adoption field reports.

  - **`init --authoring` now takes over a pristine preset scaffold.** A plain
    init on a small repo scaffolds a preset config; `--authoring` afterwards used
    to be a silent no-op (the config's existence skipped the fork entirely) —
    the one place field testers actually got stuck. A config byte-identical to
    init's own scaffold output is init-owned: `--authoring` removes it (a
    narrated `rm` action, dry-run aware) and writes the playbook. A hand-edited
    config is refused with an explicit error instead.
  - **Debt doctrine replaced: red + dual ratchet.** The 1.9.0 "one ledger via
    severity warn" advice had a hole — `severity` only covers the structural
    rules, and warn means new metric debt (maxLines…) is never gated. The
    doctrine is now: keep `error`, lock architecture debt with
    `inspect --update-baseline` and lint debt with `eslint --suppress-all`
    (ESLint ≥ 9.24 — per file × rule counts, new violations still fail); CI
    blocks only new debt on both gates. `severity: 'warn'` is demoted to the
    ESLint-8 transitional fallback, with its cost stated. Playbook, adoption
    prompt, and docs all updated in both locales.
  - **`doctor` grew a fifth check**: the lint suppressions ledger — entries
    pointing at files that no longer exist (or an unreadable ledger) fail, with
    the exact prune command in the detail.
  - Reference docs now state plainly that `emit.lint.severity` covers only the
    structural family — metric rules keep their own `blueprint.rules` tiers.

## 1.10.0

### Minor Changes

- 3540aae: Adoption DX — from a fresh vite react-ts field report. The preset path's
  finishing work (wire, verify) is now first-class commands, not stdout to
  remember.

  - **`blueprint doctor`** — a new read-only command answering "is adoption
    finished?" as a checklist (config present, no leftover `*.blueprint.*`
    reference files, eslint wired to emitLint, architecture clean under the
    baseline). Exit 0 only when all pass, so it drops into an agent verify loop
    or CI. Makes the adoption prompt's acceptance clause executable.
  - **`init --authoring`** — the symmetric escape hatch to `--preset`: force the
    authoring playbook even on a repo below the file-count threshold (which would
    otherwise scaffold a preset). The two are mutually exclusive. The preset
    branch now narrates plainly that no `blueprint-authoring.md` is written on
    that path — so an agent told to execute it no longer hunts for a missing file.
  - **Legacy `.eslintrc` is detected** instead of silently getting a fresh flat
    config written next to it (which produced two configs / two ledgers). It now
    routes to the reference + a flat-config-migration note.
  - **Shape-aware eslint wiring** — the merge instruction is tailored to the
    existing config's shape (`tseslint.config()` wraps the spread; a flat array
    takes it directly; legacy migrates first) rather than one generic snippet.
  - **knip is no longer installed by default** — zero-config knip false-flags, so
    shipping it pre-installed-but-commented was a dangling promise. It is now an
    opt-in recommendation, matching how stylelint is handled.

## 1.9.0

### Minor Changes

- fb4bb90: `init` UX: the silent decisions now speak, and local lint matches the CI gate.
  All four from a field report of a fresh vite react-ts adoption.

  - **The greenfield/brownfield fork is narrated.** When a repo has fewer than 10
    source files, init scaffolds the preset — and now says so
    (`Fresh scaffold (N source files < 10) — scaffolding the framework preset.
Repos with 10+ source files get the authoring playbook instead.`) instead of
    silently taking the biggest branch it has.
  - **Local lint gets wired to the structural rules.** Templates whose `lint`
    script doesn't run eslint (e.g. oxlint) previously stayed green locally while
    CI failed on the generated config. On a fresh scaffold init now patches the
    script (`"lint": "oxlint && eslint src"` — precondition-guarded, placed
    before the install step, visible in `--dry-run`); existing projects get an
    instruction instead.
  - **The generated eslint header no longer contradicts `--help`.** The banner
    now explains that only the blueprint-owned file (marked by that banner) is
    regenerated, while hand-written configs are never overwritten; `init --help`
    says the same.
  - **The default agent-contract pair is surfaced.** When the config doesn't
    declare `emit.agents`, init notes that both CLAUDE.md and AGENTS.md were
    written and points at the narrowing the playbook itself recommends.

- 361e27e: Brownfield honesty pass — from a legacy-repo (ESLint 8 / `.eslintrc`, 239
  pre-existing violations) field report.

  - **`import/no-cycle` dropped from the generated eslint config.** `inspect`
    already detects module cycles; the ESLint rule re-checked the whole graph
    per file — measured at 92s on an 850-file repo. One detector, the cheap one.
    `eslint-plugin-import` leaves the install set with it.
  - **The single-ledger posture is now doctrine.** Playbook + docs: on a repo
    with existing violations, wire `emitLint` at `severity: 'warn'` and let
    `inspect --baseline` be the only debt ledger — never lock the same debt as
    both eslint suppressions and a blueprint baseline; flip to `error` at zero.
    New "Legacy ESLint — one ledger, never two" section on the AI-adoption page,
    and the legacy-`.eslintrc` cliff is named in Field-Tested notes (with the
    pinned-plugin drift caveat).
  - **The gitignored-contract warning is now actionable** — it says exactly how
    to start tracking the files, not just that teammates won't have them.
  - **Honest positioning, stated where it matters**: the Philosophy page opens
    with "blueprint encodes an architecture someone already chose — it does not
    design one for you", and the README credits that the lint layer is standard
    ESLint machinery: the rarity is that rules, handbook, agent contract, and CI
    compile from one source and can never disagree.

## 1.8.2

### Patch Changes

- af41c22: API-surface and docs-site review sweep.

  - Six internal helpers (`getDiagramEdges`, `getForbiddenLayers`,
    `getModuleShape`, `getSelfOnlyTargets`, `normalizeAgentEmit`,
    `normalizeAllowedImporters`) are now `@internal` — they were never runtime
    exports of the package root, but typedoc listed them as importable Functions.
  - `AgentContractOptions`, `CiOptions`, and `PackageManager` are now exported
    types (they appear in public signatures and previously dangled unresolved in
    the API docs).
  - API reference is grouped (Author / Emitters / Runtimes / Utilities) via
    `@group`; every headline function carries an English `@example`;
    `Blueprint.framework` / `Blueprint.architecture` gained the TSDoc they were
    missing; the zh-TW API index states it is intentionally rendered in English.
  - Docs site: landing grew the compile-model diagram, a "Why" section, and two
    more cards (Adopt / Verify); new "Prior Art & Differences" page (en + zh-TW);
    en security page caught up with two zh-only facts; og/twitter meta added.

## 1.8.1

### Patch Changes

- d5cf68a: `deps` guardrails + a dedicated guide page.

  - A hand-written `blueprint.config.mjs` that bypasses `defineBlueprint` is now
    validated on load: structural mistakes fail with a precise
    `blueprint.config.mjs: <reason>` message (missing default export included)
    instead of an undefined-property crash deep inside a command. Applies to every
    config-loading command (`init` / `inspect` / `deps`).
  - The `deps` leaderboard lists source folders that sit outside the declared
    layers instead of silently ignoring them, so zero fan-in can't be misread as
    "nobody imports this"; querying into such a folder names the actual cause.
  - Flat-layout layers are annotated (`(flat layer — answers at layer
granularity)`) wherever they appear, so the granularity collapse is visible
    instead of silent. Leaderboard JSON now carries `{ modules, skipped }`.
  - New docs page "Blast Radius — deps" (en + zh-TW): how to run it, sample
    outputs, granularity via `module.layout`, and the graph's boundaries.
    `deps --help` grew a matching scope-and-granularity section.
  - Philosophy section now states its relationship to the tool explicitly: the
    Operating Contract opens with "this documents the preset payload", and every
    sub-page (beliefs / layers / component-shape / discipline) carries an
    "In blueprint" connector naming the config field it compiles from
    (`principles` / `architecture` / `componentShape` / `playbook`) and where it
    lands; Getting Started links the preset paragraph back to Philosophy.
  - New "Feature Overview" docs page (en + zh-TW): every capability listed with a
    one-line description, each linking to its how-to page — now the Guide nav
    entry and the first sidebar item; the four home-page cards link to the
    matching generated-artifact sections.
  - Docs coverage sweep (en + zh-TW): new "Checks & Config Reference" page (all
    nine `inspect` finding kinds, the six embedded plugin rules, the gated
    `blueprint.rules` ids, config fields beyond the quick-start example, the full
    CLI flag matrix incl. `init --preset`) and new "What init Generates" page
    (verbatim artifacts from a fresh init). Layer Architecture grew an
    "Ownership — `owns`" section; `inspect --help` now also names the
    `missing-layer` info finding.

## 1.8.0

### Minor Changes

- 3fa65f7: Configurable source root, first-class Next.js, and Nuxt declared unsupported —
  the terrain widens from "everything under `src/`" to real framework layouts:

  - **`architecture.sourceRoot`** (default `src`) generalizes the engine off the
    hardcoded `src/` assumption. `.` scans the project root (with a built-in
    ignore set for `node_modules` / `.next` / build output); the alias target,
    layer-file globs, and vite/tsconfig wiring all follow it. Backward compatible
    — every existing config keeps `src`.
  - **`nextPreset({ router, srcDir })`** and auto-detection. A fresh
    `create-next-app` adopts in one command: init detects the route tree
    (`app` / `pages`, under `src/` or the root) and generates the Next preset —
    the route dir is the top layer, flat module layout, and **no `fetch`
    ownership** (server components fetch everywhere by design). Both routers
    reduce to the same shape; because Next keeps imports explicit, the dependency
    graph is real and enforcement is genuine.
  - **Nuxt is refused, by design.** Its auto-imports leave no import statements
    for static analysis, so the graph would be near-empty and report a hollow
    "clean". `init` errors with an explanation rather than emit a false-green
    setup. Documented under "Not supported" on the field-tested page.
  - **The adoption e2e suite grows to ten fixtures** covering the tiers approved
    for this round: the ratchet catching a _new_ violation (not just staying
    green), the JS-project jsconfig branch, `--dry-run` writing nothing,
    survey + deps on a real repo, the `--agent` launch ordering, the emitted CI
    gate, a yarn workspace, and `--no-install` — plus the two new Next fixtures
    (root-level app router, pages router).

## 1.7.0

### Minor Changes

- 3a2c1c4: The rules stop assuming infrastructure nobody installed:

  - **Greenfield alias surgery.** On a fresh scaffold (init generated the
    blueprint config in this very run), init now wires the import alias
    directly into the template's `vite.config.*` (resolve.alias + the
    `node:url` import) and into the commented tsconfig (comment-preserving
    `paths` insertion) — precondition-guarded text edits that only touch the
    known template shapes, visible in `--dry-run`, falling back to the
    instructs on anything unexpected. Existing projects never take this path;
    the security disclosure is amended accordingly.
  - **Adoption e2e suite.** Five committed template fixtures — vite react/vue,
    Next (App Router + forwarding CLAUDE.md), a turbo + pnpm workspace package,
    and a brownfield repo with planted debt (upward reaches, a same-layer
    import, an import cycle, hand-written eslint/CLAUDE files) — driven through
    the full init → inspect → baseline → references → wired/integrated arc.
    The suite lives in the default vitest set, so the husky pre-commit and the
    new pre-push hook both gate on it locally, and the release workflow runs it
    before anything is published to npm.
  - **Weekly terrain workflow.** Scaffolds the _latest_ create-vite /
    create-next-app templates and drives the real adoption with the CLI built
    from HEAD — upstream template drift reddens the run and opens a
    deduplicated issue instead of surprising the next adopter.
  - The handbook's flow diagram now states its reading rules (reachability is
    transitive; dashed = selfOnly), and the packaged operating discipline
    covers conflicts with third-party lint advice — both straight from agent
    feedback on a field adoption.

## 1.6.0

### Minor Changes

- 99b9ad8: Two terrain fixes from the Next.js / monorepo field round, plus a
  field-tested compatibility page on the docs site:

  - **Next.js projects always take the authoring flow.** The react preset does
    not fit Next — it scaffolds `src/pages/` (a routing convention there) and
    does not declare the App Router's `app/` tree — so `init` now routes any
    project with a `next` dependency to the authoring flow regardless of file
    count. The playbook opens with the fitting shape (`app` → `components` →
    `hooks` → `lib`); `--preset` still works but carries an explicit warning.
  - **The package manager is detected from the workspace root.** In a pnpm /
    turbo monorepo the lockfile lives at the workspace root, not in the package
    being initialized — detection now walks parent directories for a lockfile
    or `pnpm-workspace.yaml`, so the authoring flow's auto-install generates
    `pnpm add -D` instead of the wrong `npm install -D`.
  - **Docs: Field-Tested Setups** — a bilingual page recording every setup the
    releases are validated against (two production apps, four fresh scaffolds,
    the turbo + pnpm per-package model) with outcomes and caveats, plus the
    not-yet-tested list.

## 1.5.2

### Patch Changes

- 277e7aa: Symmetric with the wired eslint-config detection: a hand-written CLAUDE.md /
  AGENTS.md that already mentions `@kekkai/blueprint` has been integrated by
  its owner — re-running init no longer regenerates the `<name>.blueprint.md`
  reference next to it.

## 1.5.1

### Patch Changes

- cad28b4: - **init recognizes a wired config.** When the user's own eslint config
  already imports `@kekkai/blueprint`, init no longer writes a reference
  file next to it on every re-run — the owner wired it; there is nothing
  to merge, and the plan says so instead of nagging.
  - **The Traditional Chinese documentation site is rewritten in formal
    register** — report-style prose throughout; general vocabulary is fully
    translated while proper nouns and identifiers stay verbatim.

## 1.5.0

### Minor Changes

- 8967311: Integration is the deliverable — reference files are input, not output:

  - **The authoring playbook now owns the lint wiring.** The agent merges
    `...emitLint(blueprint, …)` into the existing flat config, resolves every
    rule conflict explicitly (house disable conventions, overlapping structure
    tools), runs the project's own lint, and deletes the reference — adoption
    is not done while any `*.blueprint.*` file remains, and the acceptance
    gates say so. Legacy `.eslintrc.*` configs are the one exception: that
    migration is surfaced as a decision item, never done unilaterally.
  - **A clean repo carries no baseline.** `inspect --update-baseline` with zero
    findings writes nothing (and retires a paid-off baseline file);
    `inspect --baseline` with no file treats it as empty — one uniform CI line
    on repos with and without recorded debt.
  - **init recognizes its own eslint config.** Generated configs carry a banner
    line; a re-run regenerates the file in place instead of mistaking its own
    output for a hand-maintained config and writing a reference next to it.
  - **init warns when its artifacts are gitignored** — a best-effort root
    `.gitignore` check: if the handbook or a contract file is invisible to
    version control, the plan says so (the compact contract links assume they
    exist) instead of leaving teammates with dead links.
  - The greenfield `--agent` skip message no longer claims a config "already
    exists" three seconds after scaffolding it, and `deps` module keys for
    bare-file modules drop their extension (`components/HelloWorld`, not
    `components/HelloWorld.vue`).

## 1.4.0

### Minor Changes

- 6a7a400: The contract stops flooding your context files:

  - **Shared context files get a compact pointer block** — CLAUDE.md / AGENTS.md
    now receive ~12 lines: project facts (framework, alias, layer flow), the
    machine-gated rule list, and two links that carry the bulk — the generated
    handbook (project half, always current) and `agent-contract.md` shipped
    inside the package (generic operating discipline). Tool-owned rule files
    (Cursor, Windsurf) still carry the full contract.
  - **`init --agent claude|codex` emits one contract file** — the tool actually
    in use, instead of one per tool nobody runs. An explicit `emit.agents` in
    the config still wins, and the authoring playbook now tells the agent to
    declare its own tool there.
  - **Hand-written CLAUDE.md / AGENTS.md are never touched** — a context file
    without blueprint markers is a document someone maintains; init now writes
    a `<name>.blueprint.md` reference next to it with an integration instruct,
    and the authoring playbook's final step has the agent merge it into the
    document's own structure — link, don't duplicate.
  - **The docs site gains a Changelog page** — build-time-included from the
    repo's CHANGELOG.md, so the same push that publishes a release renders its
    notes on GitHub Pages. Synced by construction, not by hand.

## 1.3.0

### Minor Changes

- e823cb3: Five friction fixes from running the AI-assisted adoption on four real repos
  (two mature codebases, two fresh vite scaffolds):

  - **The authoring flow now installs `@kekkai/blueprint`** — the config the
    agent writes imports it, so the playbook used to fall over at the first
    `npx blueprint inspect` on a repo that never installed the package.
    `--no-install` downgrades to an instruct with the exact command, and the
    playbook opens with the prerequisite either way.
  - **The playbook reads existing intent documents first** — an architecture
    config or doc already in the repo (structure-lint, dependency-cruiser,
    `docs/architecture*`, agent-contract sections, ADRs) is intent evidence
    senior to the import matrix; it also carries what the matrix cannot see:
    zero-file layer positions, selfOnly-style constraints, ownership rules.
  - **Greenfield template cleanup is spelled out** — when fresh scaffold code
    violates the preset out of the box (vite's vue template imports
    `../assets/*` from a component), init now lists the exact findings and the
    fix path instead of letting the first lint run read as a broken install.
  - **`survey` reports unresolved alias-like specifiers** — `~x/…`-style
    imports that match no detected alias and no dependency are usually an
    undeclared alias; the report now names each prefix with its count instead
    of silently dropping it from the matrix.
  - **The tsconfig alias instruct notes that `baseUrl` is not needed** — modern
    TypeScript resolves `paths` without it, and it is deprecated in 7.0.

## 1.2.0

### Minor Changes

- f32436d: AI-assisted brownfield adoption — evidence, playbook, launcher:

  - **`blueprint survey`** — deterministic authoring evidence that runs _before_
    a config exists: top-level folders with module-shape evidence (index
    coverage, nesting depth), the folder-to-folder import matrix (alias +
    relative, heaviest first), same-folder alias imports, test-convention hits,
    and package-usage concentration as ownership candidates. `--json` for
    tooling; `--alias` when tsconfig detection finds nothing.
  - **The authoring playbook** — `init` on a brownfield repo without a config no
    longer guesses a preset: it writes `blueprint-authoring.md` (the method, the
    schema sketch, the acceptance gates, and the embedded survey) plus a
    `/blueprint-author` command file for Claude Code, and prints the launch
    one-liners. The playbook scopes itself honestly: author the config and lock
    the baseline — never refactor the debt. `--preset` keeps the old scaffold.
  - **`init --agent claude|codex`** — the thinnest possible launcher: spawns the
    _printed_ command in the foreground, interactive, under the user's own agent
    CLI permissions. Every artifact is on disk before the spawn, so a failed
    launch or an abandoned session degrades to exactly the manual path. The
    security disclosure is amended accordingly: never launches by default,
    explicit opt-in only, still zero network calls and zero credential surface.

  Field-tested end to end on a mature React + TypeScript repo: the playbook's
  evidence alone reproduced the hand-derived 11-layer config — same 246 baseline
  findings, same categories, same cycle.

## 1.1.0

### Minor Changes

- 83894a6: Per-layer module layout, a TS-aware unusedVars gate, and a depth-aware
  relative-escape rule — all three surfaced by adopting blueprint on a mature,
  previously ungoverned React + TypeScript codebase:

  - **`LayerDef.module`** — a layer can now override the shared module shape
    (`layout` / `entry`): folder modules in a feature layer while the rest of
    the project stays flat. `inspect`, `deps`, the emitted lint config, the
    handbook, and the agent contract all resolve the shape per layer, and
    deep-import bans now name each folder-layout target layer instead of
    assuming one global layout.
  - **`emitLint(blueprint, { typescript })`** — inject the `@typescript-eslint`
    plugin and the `unusedVars` gate emits the TS-aware `no-unused-vars`; the
    core twin false-flags TS enum members and type parameters (565 false
    positives on the field-test repo). `init` wires the option automatically on
    TypeScript projects, and the brownfield merge instruct mentions it.
  - **`blueprint/relative-escape`** — replaces the literal `../` ban patterns,
    which could not see file depth and so flagged intra-module imports inside
    nested module folders (~310 false positives). The rule shares inspect's
    resolution primitives, so the two gates cannot disagree — the field-test
    repo now reports exactly the same 54 escapes on both sides.

## 1.0.3

### Patch Changes

- `inspect` and `deps` now honor `architecture.testFiles`, symmetric with
  the lint side: test files are exempt from structural analysis — they
  neither produce findings (a co-located `Foo.test.js` importing its
  sibling through the alias is test plumbing, not a violation) nor form
  modules or edges in the dependency graph. Found by adopting blueprint
  on a mature production repo, where every remaining "violation" turned
  out to be a test file its own structure linter had always exempted.

## 1.0.2

### Patch Changes

- Close the reviewer's "half-wired" nuance around the dead-code gate:

  - `--no-install` no longer silently drops the dependency requirement —
    the exact install command is surfaced as an instruct, so "knip is in
    the install set" holds on every path.
  - The generated CI ships the knip step **commented** when `deadCode` is
    error-tier: one uncomment turns the gate hard, and zero-config false
    positives can never redden a fresh project's CI out of the box.
  - The agent contract's dead-code bullet now points at that commented
    step instead of a vague "wire it into CI".

## 1.0.1

### Patch Changes

- DX polish round for 1.0:

  - **The contract no longer writes checks the tooling can't cash.** "Hard
    rules (lint enforces these)" now lists only rule ids a machine
    actually gates out of the box; error-tier `deadCode` moves to the
    behavioral section with its real gate spelled out (`npx knip`,
    installed by init — wire it into CI to make it hard), and unknown ids
    are never called gates.
  - **Brownfield merge is copy-ready**: when an eslint config already
    exists, init writes `eslint.config.blueprint.mjs` — the full generated
    config as a diffable, clearly-unwired reference — and the instruct
    shows the exact diff command and minimal merge block.
  - Per-command `--help` now carries example invocations; the README
    gains a 30-second before/after tree.

## 1.0.0

### Major Changes

- 1.0.0 — the compiler is complete and the config schema is stable.

  One Blueprint compiles into six capabilities:

  - **Define** — `defineBlueprint` / `vuePreset` / `reactPreset`: ordered
    layers with `allowedImporters` (acyclic by construction), package and
    global ownership, module shape, metric/rule tiers, ten principles,
    seven component-shape axes, an eighteen-rule working playbook.
  - **Enforce** — `emitLint`: an ESLint flat config with parser wiring for
    the detected stack and an embedded five-rule plugin. Nothing extra to
    install.
  - **Explain** — `emitHandbook`: a human handbook that cannot drift from
    the rules.
  - **Collaborate** — `emitAgentFiles`: one agent operating contract
    distributed across CLAUDE.md, AGENTS.md, Gemini, Copilot, Cursor, and
    Windsurf.
  - **Bootstrap** — `blueprint init`: layers, configs, alias wiring, agent
    contracts, and a CI gate from one command — deterministic, idempotent,
    and it never operates an agent.
  - **Verify** — `blueprint inspect` (nine checks + the baseline ratchet
    for brownfield adoption) and `blueprint deps` (blast radius).

  Field-proven on fresh create-vite react/vue projects — including a full
  feature written by a coding agent under the generated contract, where
  lint stayed green and `inspect` caught the one thing lint cannot see:
  code drifting into undeclared folders.

## 0.2.3

### Patch Changes

- The generated eslint.config.mjs now wires parsers for the detected
  stack — vue-eslint-parser for SFCs (with the TypeScript parser inside
  `<script lang="ts">`), typescript-eslint for .ts/.tsx, and espree's JSX
  mode for React .js/.jsx. Parsers only: framework rule packs stay the
  user's choice. Found by running init against fresh create-vite
  templates, whose App.tsx / App.vue previously failed to parse under the
  generated config; the packages backing the parsers join the install
  set.

## 0.2.2

### Patch Changes

- Security & trust disclosure: the README and the docs site now state
  explicitly that the package never operates an agent CLI (it prepares
  plain-markdown contracts and hands off — no credential surface), makes
  no network calls, has zero runtime dependencies, runs exactly one
  declared and skippable child process (the dependency install), bounds
  every write, and ships provenance-signed releases.

## 0.2.1

### Patch Changes

- Slim README: the docs site (https://taco3064.github.io/blueprint/) now
  owns the full guide, API reference, and philosophy — the npm page keeps
  a compact introduction and one link.

## 0.2.0

### Minor Changes

- The DX round — discoverability, brownfield adoption, blast radius:

  - **Real help**: top-level usage leads with the value proposition;
    `init` / `inspect` / `deps` each have `--help` describing what gets
    generated, every flag, and the auto-detect / no-overwrite / idempotent
    guarantees.
  - **`inspect --baseline` / `--update-baseline`** — the brownfield
    ratchet: record today's debt in `.blueprint-baseline.json`, then fail
    only on new findings; stale entries are reported so the ratchet keeps
    tightening.
  - **`blueprint deps [module]`** — reverse dependencies / blast radius:
    who imports a module and what it imports, or the full fan-in
    leaderboard; `runDeps` is exported from the package root.
  - README (both languages) opens with a Before/After tree and documents
    the hand-off stance.

## 0.1.3

### Patch Changes

- CLI etiquette: `--help` / `-h` prints usage and exits 0 (it previously
  fell through as an unknown command, exit 1), and `--version` / `-v`
  prints the package version (read at runtime from package.json, covering
  both the bundled and source layouts).

## 0.1.2

### Patch Changes

- Fix the installed CLI being a silent no-op. npm installs the bin as a
  symlink and Node resolves the entry module to its real path while
  `argv[1]` keeps the symlink path, so the entry guard never matched —
  `npx @kekkai/blueprint` exited 0 doing nothing. The guard now resolves
  `argv[1]` through `realpathSync` before comparing, and is unit-tested
  against a real symlink.

## 0.1.1

### Patch Changes

- Release housekeeping — first published version.

## 0.1.0

### Minor Changes

- First release — Architecture as Code. One Blueprint compiles into:

  - **Enforce**: an ESLint flat config (one-way layer flow, module-entry
    boundaries, package/global ownership, metric gates) plus an embedded
    plugin (`no-deep-watch`, `use-prefix`, `use-prefix-needs-reactivity`,
    `test-filename-matches-source`, `no-typedef-only-file`).
  - **Explain**: a human handbook (layers, module shape, component-shape
    axes, principles, working playbook) with a mermaid flow diagram.
  - **Collaborate**: an agent operating contract distributed across tool
    files (CLAUDE.md, AGENTS.md, GEMINI.md, copilot-instructions, Cursor
    and Windsurf rules).
  - **Bootstrap**: `blueprint init` — scaffold layers, generate configs,
    wire the import alias into tsconfig/jsconfig, emit a CI gate.
  - **Verify**: `blueprint inspect` — a read-only architecture report
    (closed-world folders, flow violations, deep imports, ownership,
    cycles) with migration steps; error findings exit 1 for CI.
  - Canonical `vuePreset` / `reactPreset` encoding the governance
    handbook: six layers, ten principles, seven component-shape axes, an
    eighteen-rule playbook.
  - Bilingual README (English / 繁體中文) with the full API reference.
