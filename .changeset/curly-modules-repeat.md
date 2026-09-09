---
'@kekkai/blueprint': major
---

Add optional module-first topology through `architecture.modules`, repeating the declared layers beneath every module while preserving layer-first projects.

Move unit layout and entry configuration directly onto each layer, rename the `flat` layout to `file`, and retire `architecture.module`, `layers[].module`, and `module.private` with targeted migration errors.

Update lint, inspect, dependency reports, generated docs, and agent contracts to use Module → Layer → Unit identities consistently.

Declare direct module dependencies with optional `architecture.modules[].dependsOn`. Blueprint rejects invalid module graphs, resolves transitive reachability, and requires governed imports to pass both the module DAG and the existing inner layer flow.
