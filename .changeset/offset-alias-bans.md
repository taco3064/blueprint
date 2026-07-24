---
"@kekkai/blueprint": patch
---

An additional alias whose target sits above the source root now really joins the bans (field issue #29): `'~root': '.'` used to emit `~root/<layer>` patterns no real import ever used — the whole `~root` leg of every structural ban was a silent no-op, inspect was equally blind to `~root/src/<layer>` imports, and a closing report almost claimed a protection that did not exist. Emit and inspect now derive each alias's layer base from one shared helper with the target offset baked in (`~root/src/views/**`, selector `^~root\u002Fsrc\u002F…`), so patterns and findings cannot disagree; an alias into a subfolder has no layer surface and carries no layer bans, and the playbook says so.
