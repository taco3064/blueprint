---
'@kekkai/blueprint': patch
---

**A `cycle` finding now says whether the loop it printed is the whole knot.**

`inspect` reports one cycle per knot of mutually dependent modules — deliberately,
because a graph's cycles can outnumber its modules exponentially and a list like that
is not an inventory either. What it never said is that the line being read may be one
loop out of a knot that holds more. So breaking that loop retired its baseline entry,
surfaced the survivor under a different subject, and turned a green gate red on a repo
with strictly **less** debt, with nothing in the output to say why. The obvious reading
was that the fix caused the failure, and the obvious remedy was to revert it.

The gate is unchanged and correct: a knot is several pieces of debt, and clearing one
of them is new information. What changed is that the run says so — at the two widths
the tool can measure without counting cycles:

- **The printed path names fewer modules than the knot holds** → the finding says so
  definitely, and names the full membership so the part the path omits is visible.
- **The path names every module in a knot of three or more** → the finding says that
  clearing this one can surface another in the same knot, and claims nothing about
  whether one exists.
- **An ordinary cycle — two modules, or a module importing itself** → unchanged, byte
  for byte. Two modules the path already names have exactly two edges and so exactly
  one cycle: cut either and the knot is gone. "This may leave another" is not cautious
  there, it is false, and a caveat on every ordinary cycle report is one none of them
  earned.

No count appears in any of them. *"One of three"* would be an enumeration this tool
refuses to compute, and a guessed count is worse than silence because the count is the
part a reader plans around.

**Nothing about the baseline moved.** A cycle's `subject` is still the printed path's
members, the key is still `rule + path + subject` matched by exact equality, the
baseline document is still version 3, and a baseline recorded before this release still
suppresses exactly what it suppressed then — a finding's identity has never included
its prose.
