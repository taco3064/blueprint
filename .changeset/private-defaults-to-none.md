---
'@kekkai/blueprint': minor
---

`architecture.module.private` is now optional — omitting it means no
private parts (`[]`). A draft-first config that never mentions private
sub-parts validates instead of failing with "must be an array" (field
issue #11). Explicit `private: []` keeps working unchanged; a non-array
value still fails loudly. The playbook's schema sketch marks the field
optional.
