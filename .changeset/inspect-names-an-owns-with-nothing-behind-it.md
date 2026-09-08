---
"@kekkai/blueprint": patch
---

Add an informational `owns-not-installed` finding when a layer declares ownership of a
package that is not installed. It names the package and layer without changing exit codes or
baseline contents.
