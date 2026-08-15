# 升級到 4.0.0

**有六件事會壞掉，這一頁按「誰會撞到」排，不是按大小排。**<br>
前四件連「這次什麼都不打算導入」的專案都躲不掉；<br>
後兩件則碰不到任何沒有宣告 `architecture.modules` 的人。

中間有一條線會告訴你「扁平專案讀到這裡就可以停」。<br>
那條線是量出來的，不是嘴上保證的：扁平專案這一版產出的檔案、`blueprint rules` 與 `blueprint deps` 的輸出都沒有變，文字輸出與 `--json` 都一樣。

模型本身是加法。<br>
不寫 `modules`，扁平結構的行為跟以前一模一樣 ——<br>
[扁平還是模組化](/zh-TW/guide/structure)把兩棵樹都畫出來了，「該選哪一種」屬於那一頁。<br>
這一頁只講「你得動哪一行」。

## 1. `blueprint init` 在全新的樹上會拒絕

**誰會撞到：任何在低於既有專案門檻的樹上跑 `init` 的人。**<br>
這是這一版唯一一個「不需要你寫過任何東西」就會撞到的破壞 —— 不用 config、不用 script、不用 baseline。<br>
拿 template repo 跑 `init` 的自動化流程，會在自己什麼都沒改的情況下開始失敗。

```bash
# before —— 3.x
blueprint init                       # → 扁平 config，exit 0

# after —— 4.0.0
blueprint init                       # → exit 1，並點名那個選項
blueprint init --structure flat      # → 跟 3.x 寫出來的完全一樣
blueprint init --structure modular   # → 功能模組擺在原始碼根目錄
```

拒絕訊息會印出檔案數、門檻，以及兩個指令，所以解法就在輸出裡。

它選擇拒絕而不是給預設值，是因為 config 的遷移不用錢、檔案的遷移要：<br>
之後才要換，等於把 `src/` 底下每一個檔案都搬一次。

**有兩種情況根本不會被問到**，而且這兩種都不是從 3.x 改掉的行為。<br>
超過門檻（10 個原始碼檔）的 repo 有佈局可讀，所以 `init` 改成寫出作業守則文件；<br>
偵測得到的 Next.js 路由樹則會直接建立 Next preset，並說明為什麼沒問你 —— `nextPreset` 只長得出一種形狀，根本不收 `structure`。

如果你是要「重新選」而不是「把 3.x 的行為要回來」，<br>
[扁平還是模組化](/zh-TW/guide/structure)有兩棵樹跟各自的理由。

## 2. `architecture.module` 被刪掉了

**誰會撞到：每一份 3.x 的 config，包含這次什麼都不打算導入的扁平專案。**<br>
這正是最常被漏掉的那一句。<br>
模組的「形狀」並沒有消失 —— 它搬到真正擁有這個形狀的那一層上面去了。

**你的 3.x config 可能有兩種寫法，兩種都沒了：**

- `architecture.module` —— 所有分層共用的那份形狀
- `architecture.layers[].module` —— 針對單一分層收窄用的覆寫

```js
// before —— 3.x，共用的那份
architecture: {
  module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles'] },
  layers: [
    { name: 'components', does: '可重用的使用者介面元件' },
    { name: 'services', does: '網路存取原語' },
  ],
}

// before —— 3.x，單層覆寫
architecture: {
  layers: [
    { name: 'components', does: '…', module: { layout: 'folder', entry: 'index' } },
    { name: 'services', does: '…' },
  ],
}

// after —— 4.0.0，兩種都變成同一件事
architecture: {
  layers: [
    { name: 'components', does: '…', layout: 'folder', entry: 'index' },
    { name: 'services', does: '…' },
  ],
}
```

**`private` 直接消失，沒有替代品**，而且跟著它一起消失的東西是零：<br>
資料夾單元裡面，入口限定禁令本來就已經蓋住每一個非入口檔了，所以那份清單其實什麼都沒在擋。

這個編輯沒做，config 就載入不了 —— `defineBlueprint` 會拋錯，而訊息本身帶著替代寫法：

```
Unknown key "module" in architecture — nothing reads it, so the declaration is
silently dead. The module shape moved onto each layer in 4.0.0 — write `layout` /
`entry` there instead: layers: [{ name: 'components', does: '…', layout: 'folder',
entry: 'index' }] (entry defaults to "index", layout to "file"). `private` is gone
with no replacement: the entry-only ban already covers every non-entry file, so
nothing was enforcing it. Every 3.x config must make this edit, including a flat
project that is not adopting `modules`.
```

單層覆寫那種寫法會拋出同一段提示，並且點名它是在哪一層找到的：<br>
`Unknown key "module" in layer "components" — …`。

## 3. layout 的值 `'flat'` 改叫 `'file'`

**誰會撞到：正在做第 2 步的你。**<br>
這不是一個「要去 3.x config 裡面翻出來」的欄位 —— `layers[].layout` 在 3.x 根本不存在，翻也翻不到。<br>
會跟著過來的是那個「值」。

3.x 的時候這個字住在 `architecture.module.layout`，它的值域是 `'folder' | 'flat'`。<br>
第 2 步要你把 `layout` 搬到分層上，而你如果連值一起照抄，就會得到 `layout: 'flat'` —— 4.0.0 拒收這個值。<br>
這一條就只有這件事。

```js
// 第 2 步如果把舊的值一起抄過來，會長這樣
layers: [{ name: 'components', does: '…', layout: 'flat' }]   // → 拋錯

// after
layers: [{ name: 'components', does: '…', layout: 'file' }]   // → 同樣的形狀
layers: [{ name: 'components', does: '…' }]                   // → 也是同樣的形狀
```

`'flat'` 之所以改名，是因為 `structure: 'flat' | 'modular'` 現在需要這個字來講「根結構」，<br>
而同一份 config 檔不能用同一個字拼兩條不同的軸。<br>
`'folder'` 沒有動，預設值也沒有動。

它在載入時就失敗，不是等到 lint 才講，而且會說要改成什麼：

```
Layer "components" has layout "flat", renamed to "file" in 4.0.0 — same shape,
one file per unit: layers: [{ name: 'components', does: '…', layout: 'file' }].
Omitting the key resolves to it too, so deleting the line is the other valid edit.
```

## 4. 版本 2 的 baseline 會被拒收

**誰會撞到：每一個手上有 `.blueprint-baseline.json` 的專案，扁平或模組化都算。**<br>
一行指令解決，記錄的是同一批債務，原本被抑制的沒有任何一項會變成不抑制：

```bash
npx @kekkai/blueprint inspect --update-baseline
```

檔案從版本 2 走到版本 3，是因為檢測項目識別碼是紀錄鍵的一部分，<br>
而 `relative-escape` 拆成了三個識別碼 —— `src-escape`、`entry-bypass`、`layer-escape` —— 各自點名「對它而言合法的那個動作」。<br>
用舊識別碼記下來的項目一項都對不上，所以舊檔是被拒收，而不是拿新規則去重新解讀 ——<br>
用新識別碼去讀它，會變成一項都抑制不了，然後把你整份已經承認過的債務全部當成新債報出來。

拒絕訊息會點名你這份檔案的版本，以及對它而言變了什麼。<br>
完整背景（包含更早的版本 1 那一次）見<br>
[升級時已經有 baseline 檔](/zh-TW/guide/getting-started#升級時已經有-baseline-檔)。

**`4.0.0` 只有這一個 baseline 遷移。**<br>
特別講一下：`cycle` 這個檢測項目的位址「沒有」變 ——<br>
它仍然是相對於原始碼根目錄的模組圖節點鍵，沒有任何 baseline 紀錄會移位，也不會有哪次升級把已抑制的 `cycle` 變回新債。

## 扁平專案讀到這裡就可以停了

**如果你的 `blueprint.config.mjs` 裡沒有 `architecture.modules`，你做完了。**

第 5、6 條是兩個指令的 `--json` 形狀變動，兩條都在扁平專案上對照 `v3.1.0` 量過：

- **`blueprint rules --json`** —— 每一列都是 `zone: "layer"`、每一列都帶 `layer`，跟以前完全一樣。<br>
  `zone` 對扁平專案來說就只是「多了一個鍵」，沒有別的
- **`blueprint deps --json`** —— 最上層的鍵是 `modules`、`skipped`、`derivation`，<br>
  而 `modules[].module` 裝的還是它一直以來裝的東西。扁平專案「根本沒有」`units` 這個鍵

只有在你「要宣告 `architecture.modules`」**而且**「有東西把這兩個輸出當 JSON 讀」的時候，才需要往下看。<br>
這兩條都不會拋錯 —— 使用端讀到一個已經不是原本意思的鍵，然後就這樣繼續跑下去 ——<br>
所以它們只能寫在這裡，工具沒辦法報給你。

## 5. `blueprint rules --json` 的每一列用 `zone` 區分

**誰會撞到：在模組化 repo 上讀 `rules --json` 的程式。**<br>
作業守則文件有五個地方叫導入中的 agent 去看這份輸出，所以「程式」也包含 blueprint 自己寫在文件裡的流程。

在 `modules` 之下，產出的 config 拿的是「每一組 *(模組, 分層)* 一份禁令」，而不是「每一層一份」，<br>
再加上每個模組自己的根各一份。<br>
所以每一列多了 `zone`，而且**三種 zone 裡面有兩種沒有 `layer`**：

```
zone=layer    有 layer      每組 (模組, 分層) 一列
zone=root     沒有 layer    每個「有分層的模組」一列 —— 模組自己的根
zone=module   沒有 layer    每個 `layers: false` 的模組一列 —— 整個模組
```

**要先想清楚的是 `root` 那幾列。**<br>
它們不需要你宣告任何東西：一份只有兩個普通模組、任何地方都沒寫 `layers: false` 的 config，就已經一個模組吐一列了。<br>
無條件去讀 `layer` 的使用端，第一個撞到的是 `root`，不是比較罕見的 `module`。

```js
// before —— 3.x，扁平專案到今天也還是這樣
for (const row of bans) index[row.layer] = row;

// after —— root 與 module 兩種列上，row.layer 是 undefined
for (const row of bans) {
  index[row.zone === 'layer' ? `${row.module}/${row.layer}` : row.module] = row;
}
```

在 `modules` 之下每一列都有 `module`，所以它才是該拿來當鍵的欄位；<br>
`layer` 是在 zone 說「這列有分層」的時候才拿來收窄用的。

要手動貼選擇器的話，`jsLiteral` 是掛在該列 `selfOnly` 陣列的每一個項目上的 ——<br>
跟 `target`、`selectors`、`note` 並排 —— 而它是「貼過去還活著」的那一個欄位。<br>
記得取「你真的要合併的那一筆」的列：隔壁鄰居的選擇器是另一個字串，貼錯會裝上一條什麼都對不到的規則，而 lint 一路綠燈。

## 6. `blueprint deps --json`：`module` 換了意思

**誰會撞到：在模組化 repo 上讀 `deps --json` 的程式。**<br>
這一條比單純改名更難搞，因為那個鍵「看起來完全沒變」：`module` 名字留著，意思換掉了。

- **3.x**，以及 4.0.0 的扁平專案，`modules[].module` 是**分層** —— `components`、`services`
- **在 `architecture.modules` 之下**，`modules[].module` 是**功能模組** —— `Fighter`、`Combat`；<br>
  裡面那一層則搬到新的 `units` 陣列，鍵叫 `unit`，旁邊附上它所屬的模組

```jsonc
// after —— 模組化。兩種粒度同時都在，而它們回答的是不同問題
{
  "modules": [
    { "module": "Fighter", "importedBy": [], "imports": [] }
  ],
  "units": [
    {
      "unit": "Fighter/components",
      "importedBy": [],
      "imports": [],
      "module": "Fighter",
      "moduleImportedBy": []
    }
  ]
}
```

原本把 `modules[].module` 餵給「預期收到分層」的東西的使用端，會照樣跑下去，然後開始回答功能模組的事。<br>
**能抓到這件事的判斷是「有沒有 `units`」** —— 扁平專案沒有這個鍵，一旦宣告了模組就一定有。

文字輸出講的是同一件事，只是把兩份排行都標上了名字 ——<br>
因為一份清單會默默回答「讀的人沒問的那一題」：<br>
見[影響範圍 —— deps](/zh-TW/guide/deps)。
