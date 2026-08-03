---
'@kekkai/blueprint': major
---

**Folder layout is entry-only.** `../Sibling` — one module reaching another
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
