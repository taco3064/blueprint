# `sh scripts/hook-requires.sh <hook> <command>...`, from a tracked hook, before its first
# command. A tree that cannot run the gate refuses with the remedy, instead of leaving
# `sh -e` to exit 127 and husky to answer with a PATH dump that names no next step.
#
# Not in `.husky/`: CI reads every tracked file there outside `_/` as a hook and demands a
# matching `.husky/_/<name>` shim, which husky generates only for real hook names. Not in
# `.husky/_/h`: `prepare` regenerates that file on every install and CI asserts it is
# byte-identical to husky's own, so an edit there is reverted in every tree that would read
# it and red in every tree that would not.
#
# `command -v` is the resolution the hook itself is about to do — `_/h` has already put
# `node_modules/.bin` on PATH — so a command installed anywhere on PATH stays silent, and
# the refusal never accuses a tree that has one. Git runs hooks from the worktree root,
# which is what makes both that relative PATH entry and the relative path above resolve for
# a commit made from any subdirectory.

hook=$1
shift

for cmd in "$@"; do
  command -v "$cmd" >/dev/null 2>&1 && continue

  echo "blueprint - \`$cmd\` is not installed in this tree, so the $hook gate cannot run: run \`npm ci\` here (each checkout needs its own install), then ${hook#pre-} again." >&2
  exit 1
done
