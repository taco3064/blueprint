---
"@kekkai/blueprint": minor
---

`architecture.module` is optional — the playbook's "flat default" is now real (field issue #23): omitting the block, or any of its keys, resolves to `{ layout: 'flat', entry: 'index' }` through one shared reader, and an empty `entry` still fails loud with the default named as the way out. Validation used to demand `module.entry` while Method step 5 said plain files take the flat default — the field agent burned two edit-run cycles proving the tool contradicted itself.
