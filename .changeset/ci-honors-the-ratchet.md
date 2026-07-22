---
'@kekkai/blueprint': patch
---

The emitted CI workflow now gates with `npx blueprint inspect --baseline`
instead of plain `inspect` (field issue #10, live-verified). A missing
baseline is an empty one, so greenfield behavior is unchanged — but locked
brownfield debt no longer turns the tool's own CI permanently red, which
contradicted both `inspect --help`'s CI example and the playbook's ratchet
model. `inspect --update-baseline`'s no-debt messages now point at the
`--baseline` CI line too, instead of telling the reader plain `inspect` is
the gate, and the compact agent contract's verify line prescribes
`inspect --baseline` for the same reason — red only on findings the agent
itself introduced.
