# 扁平還是模組化 —— 根結構怎麼選

**單向流動從哪裡開始。**<br>
要嘛技術分層擺在原始碼根目錄、每個功能散在各層裡（`flat`）；<br>
要嘛功能模組擺在根目錄、每個模組裡面各有一份那些分層（`modular`）。

在全新的樹上，`init` 不會替你選。<br>
它會拒絕，並且點名那個旗標：

```
✗ blueprint init needs --structure here: 0 source files, below the brownfield threshold (10) — there is nothing here to measure, so this is your call, not a detection failure.

  blueprint init --structure flat      the layers at the source root:
                                       src/components/, src/services/
  blueprint init --structure modular   feature modules at the source root, each
                                       holding those layers: src/<module>/services/

init refuses rather than picking one because this is the one choice here that is expensive to undo: the config migration is free, the file migration is not — switching later moves every file under src/. Above the threshold init never asks; it reads the layout you already have.
```

這一頁存在的理由就在這裡：<br>
那則拒絕訊息講得出取捨，但畫不出那兩棵樹。樹在下面。

## 兩棵樹

兩棵都是 `reactPreset()`，差別只有 `structure` 一個選項。<br>
下面每一棵都是工具自己產出來的：資料夾取自 `init` 自己的 plan 輸出，有註解的區塊則是從同一次執行寫出的 `docs/architecture-handbook.md` 直接複製過來。

### `flat` —— `reactPreset({ name: 'my-app' })`

```
src/
├─ pages/         # route layout — assembles containers
├─ containers/    # a feature: assembly, local state, calls services
├─ components/    # reusable, presentational UI
│  └─ Example/
│     ├─ index    # public entry — the only importable file
│     └─ Example  # implementation (named after the unit)
├─ hooks/         # adapts server and shared state; owns the store
├─ contexts/      # defines and provides Context / Provider only
└─ services/      # network primitives
```

六層，照流向排列：一層只能匯入排在它下面的層。<br>
`src/components/Example/` 是一個**單元** —— 一個資料夾，外面只看得到公開入口。

### `modular` —— `reactPreset({ name: 'my-app', structure: 'modular' })`

```
src/
├─ app/              # a module — its root composes the layers below
│  ├─ index          # the module's public surface — always `index`
│  └─ components/    # a layer, inside the module
│     └─ Example/
│        ├─ index    # the unit's entry — the only importable file
│        └─ Example  # implementation (named after the unit)
└─ common/           # another module — same shape, its own layers
```

兩個流向，一個包在另一個裡面。<br>
模組在根目錄這一層單向流動 —— 一個模組只能指名宣告在它**後面**的模組 ——<br>
而每個模組**裡面**的分層，單向流動的方式跟 `flat` 完全一樣。

## 兩份分層清單本來就不一樣，而這正是重點

你沒辦法從其中一棵樹推出另一棵，因為模組化的 preset 出的根本不是同一組分層：

- **`flat`** —— `pages` → `containers` → `components` → `hooks` → `contexts` → `services`
- **`modular`** —— `components` → `hooks` → `contexts` → `services`

**`pages` 與 `containers` 是被刪掉，不是改名。**<br>
路由搬進 `app` 模組；<br>
而 `containers` 以前扮演的角色 —— 組裝一個功能的那個東西 —— 現在就是模組自己的根。<br>
模組根是那個隱含的最上層，所以它不會是清單裡的一個名字。

preset 也宣告了兩個「不用發明任何領域就能命名」的模組：

- **`app`** —— 路由與 app 層級的組裝：路由樹，以及每個畫面被掛在什麼東西裡面。<br>宣告在最前面，所以沒有人可以指名它
- **`common`** —— 不只一個模組需要、又不屬於任何單一模組的東西。<br>宣告在最後面，所以誰都可以指名它

不會有任何功能模組被建出來，因為 preset 不認得任何領域。<br>
領域一個一個浮現時，你自己在 `src/` 下面加資料夾，並在 `architecture.modules` 裡逐一宣告。

## 還有什麼會跟著換

宣告 `architecture.modules` 會換掉整份 config 的詞彙，所以有幾件事會跟著動：

- **有六個檢測項目只在 `modules` 之下存在** —— `undeclared-module`、`missing-module`、`root-import`、`module-escape`、`undeclared-dependency`、`module-reexport` ——<br>
  而 `undeclared-folder` 會被 `undeclared-module` 取代。<br>
  另外三個（`deep-import`、`no-entry`、`package-ownership`）會開始同時回答兩個層級，每則訊息會講明自己指的是哪一層。<br>
  完整清單見[檢測總表](/zh-TW/guide/reference#inspect-回報的檢測項目)
- **會多產生兩條 lint 規則** —— `blueprint/no-module-root-import` 與 `blueprint/no-module-reexport`，<br>
  兩條都是結構規則，沒有任何 `blueprint.rules` 識別碼開得動它們
- **模組只碰得到它自己宣告過的東西。**<br>
  `imports` 就是全部，不寫代表一個都碰不到 —— 這跟分層的預設相反：分層是「排在前面的都可以匯入」，直到 `allowedImporters` 把它收窄
- **模組也可以獨佔基元。**<br>
  模組上的 `owns` 擋掉其他**模組**，就像分層的 `owns` 擋掉其他分層一樣
- **`layers: false`** 讓某個模組放棄裡面那層分層詞彙 —— 路由型模組就是這樣表達的 ——<br>
  而且只放棄這一件事：`imports`、入口限定禁令、`owns`、度量關卡與涵蓋率，全部照樣伸得進去

## 什麼時候模組化才划算

**模組買到的是「寬度」。**<br>
它解決的是「一個功能的 code 被抹在六個分層資料夾上、沒有任何一個目錄就是那個功能」這件事。<br>
但這個問題要成立，前提是你真的有好幾個彼此分得開的功能 —— 而大多數 repo 還沒走到那裡。

誠實的版本是一個量測，不是一種偏好：<br>
一個只有 48 個原始碼檔的專案，根本沒有寬度可以切。<br>
每個分層資料夾就那幾個檔、幾乎全部屬於同一個領域，硬切成模組只會生出一堆「為了滿足 config 而存在」的資料夾。<br>
**小專案維持扁平是對的**，而且在第二個領域真的出現以前，這個決定不需要重新拿出來討論。

還有兩件事值得一起衡量：

- **config 的遷移不用錢，檔案的遷移要。**<br>
  之後才切換，等於把 `src/` 底下每個檔案都搬一次。<br>
  這個不對稱正是 `init` 選擇拒絕而不是給預設值的原因 —— 成本不在 config 上，而 config 偏偏是工具唯一能替你改的那一半
- **Next.js 兩種都不吃。**<br>
  `nextPreset` 直接拒收 `structure`：模組化模型還沒有 Next 的分層清單，<br>
  而且路由樹一旦變成模組之後，`router` 與 `srcDir` 各自代表什麼意思，目前是沒設計過的。<br>
  想自己挑分層清單的話，用 `defineBlueprint` 自己宣告 `architecture.modules`

## 怎麼宣告

用 preset 的話，就是一個選項：

```js
import { reactPreset } from '@kekkai/blueprint';

export default reactPreset({ name: 'my-app', structure: 'modular' });
```

沒有 `structure: 'flat'` 這種寫法 —— 扁平是預設，所以走那條路時 `init` 根本不會寫 `structure` 這個欄位。<br>
用手寫的 `defineBlueprint` 時，同一個選擇就是「有沒有 `architecture.modules` 這個欄位」。

如果兩邊對不起來 —— 磁碟上的樹是一種模型、config 宣告的是另一種 ——<br>
`inspect` 會在判斷任何單筆宣告之前先報 [`structure-mismatch`](/zh-TW/guide/reference#inspect-回報的檢測項目)，<br>
並且對兩種答案各自點名該做的那一筆修改。
