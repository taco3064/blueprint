---
"@kekkai/blueprint": patch
---

**Two CRLF remnants, both on the reading side.** The alias-insertion fix in the
previous release came out of the new `windows-latest` CI leg; these came out of
searching for the same class deliberately, because that leg only reddens where a
fixture happens to reach the code.

- **Handbook table cells no longer keep a stray carriage return.** `escapeCell`
  collapsed `\n` runs to a single space, so a multi-line `does` or `mustNot`
  written on Windows left its `\r` in the middle of the cell — past the reach of
  the trailing trim, and a control character inside a rendered table.
- **The `.gitignore` re-include block takes the file's own line ending.** When
  `init` appends `!CLAUDE.md` negations to keep the agent contract tracked, it read
  a CRLF file and wrote LF lines onto it. git reads both, so nothing broke — but
  blueprint was the reason a tracked file ended up with two conventions in it.

Neither is a crash; both are blueprint leaving its own inconsistency in a file it
edited.
