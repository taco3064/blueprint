---
"@kekkai/blueprint": patch
---

**Two flags and a refusal that described a mechanism and left the outcome to be
discovered.** From the field run on the previous release candidate — four adoptions,
`doctor` 7/7 on all of them, no agent blocked.

**`init --help` says where `--authoring` lands on a small repo.** The flag reads "force
the authoring playbook even on a small repo", which is exactly what it does — and below
the threshold the playbook's first verdict is the early exit, which ends by running
`--preset`. Four separate field agents reached for the flag and had to work that out from
the run's output; one asked outright whether its reading matched the user's intent, since
"force authoring" can be read as "force me to hand-write a config" and that is not what
happens. The help now names the outcome as well as the mechanism.

**The re-authoring refusal stops asserting something it never measured, and says what
cannot come back.** It read "blueprint.config.mjs exists and has been edited". All init
knows is that the file differs from what it would scaffold today — and a config authored
by a previous agent differs without anyone having edited it, which is how a field run came
to be told it had edited a file it had only committed. "Re-authoring would discard your
work" also reads as recoverable, and the half that is recoverable is not the half worth
keeping: the authoring flow rewrites rather than merges, so the structure comes back (one
run reproduced it byte for byte) while the comments explaining why each threshold and
ownership was chosen do not. The refusal now says both, and says to copy what you want to
keep first.

Also in the harness rather than the package: when an agent dies before writing its
feedback file, the report copies the last 20 lines of `agent.log` instead of pointing at
it. The first non-zero agent exit in this harness's life was an API connection dropping
mid-response — 81 bytes of log that explained the whole run, in a staging directory under
`os.tmpdir()` that earlier batches had already lost by the time anyone read the issue.
