Help adopt @kekkai/blueprint in this repo, autonomously:
run `npx @kekkai/blueprint init --authoring`
(if the package is not installed yet, npx will fetch it — or run
`npm install -D @kekkai/blueprint` first),
then execute the blueprint-authoring.md it writes, fully and to the end
(its own verdict counts as full execution — an early exit it prescribes IS
the end, not an abandonment).
Work autonomously — never stop to ask for confirmation.

Acceptance (`npx blueprint doctor` passes):
- lint, `inspect --baseline`, and the existing tests all pass
- emitLint genuinely wired into ESLint (no leftover reference files)
- no source edits — lock existing debt: `inspect --update-baseline` for
  architecture, `eslint --suppress-all` for lint (both only when debt
  exists — an empty ledger is ceremony, not a deliverable)

最後一步（必做）：把你對 @kekkai/blueprint 這次導入體驗的 feedback 寫進
repo 根目錄的 blueprint-field-feedback.md（繁體中文），三個段落：

- 好用的 —— 哪些設計真的有幫到你
- 卡到的 —— 工具本身的問題（不是這個專案的問題），含你被迫繞路、
  或需要逆推工具內部才能前進的地方
- 拿不準的 —— 你自己判斷、工具沒接住的決定

誠實寫，不用客氣；沒有踩點就寫沒有。
