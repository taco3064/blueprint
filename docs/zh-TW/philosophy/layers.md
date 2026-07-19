# 分層架構

**單向依賴流 + 每層單一職責。** 原則本身框架中立（Vue / React 都成立），單元對應（沒有主從）：`composable ↔ hook`、`context ↔ Context`、`SFC ↔ function component`、`service ↔ api client`。

```
pages/views → containers → components → hooks → services → assets/i18n
                  ⇢ contexts（Provider only）
       hooks ⇢ contexts（Context only、selfOnly）
    contexts → services
```

## 為什麼要單向流

1. 每層職責單一（hook 不 import component → 保持是可重用邏輯）
2. 一眼看得出 ownership，不用 grep 整個 repo
3. 重構安全，跨層搬檔時 lint 一次把所有非法 call site 標出來
4. 加一條依賴邊 = 改 blueprint，逼「這層真的該依賴那層嗎？」在 review 就浮出來

## 各層職責

| 層 | 職責 | 不該做 |
|---|---|---|
| `pages` | Page layout + 組裝 containers；對應 route、SEO | 不放商業邏輯、不直接堆 components |
| `containers` | 一個 feature 的組裝 + 業務邏輯 + CRUD；有狀態、打 service、驅動 navigation | — |
| `components` | 可重用 UI 原件、盡量 presentational、可呼叫 hook | 不碰 router、不直接呼叫 service、不擁有 app state |
| `hooks` | `inject` / `useContext` 只在這；加工 server / shared state；**store（Pinia / Zustand）是這層私有物件** | 不對外曝 raw store |
| `contexts` | `provide` / `createContext` 只在這；曝 Context / Provider | — |
| `services` | 網路原件；唯一 import `axios`、唯一呼叫 `fetch` / `WebSocket` | 只回資料，不含 UI / business 邏輯 |

**沒有 `stores`、沒有 `utils` 這兩層。** 一個 store 有單一擁有它的 hook 模組（那個 hook 就是它對外的臉），其他 feature 一律透過那個 hook 讀。而 `utils/` 是個沒有 cohesion 的雜物櫃：任何「看起來通用」的東西都往裡丟、無限長，最後變成誰都在 import 的耦合點 —— 純函式按「誰在用」歸屬：只有這個模組用 → 模組內私有檔；跨模組共用 → 有名字、按 domain 分的獨立模組，讓它「掙得一個名字」。

## Feature Folder —— 一個模組怎麼組

```
components/
└─ Dropdown/
   ├─ index        ← 對外唯一入口（public）
   ├─ Dropdown     ← 實作本體 = 模組名（不叫 Component）
   ├─ hooks        ← private
   ├─ styles       ← private
   └─ types        ← private
```

- `index` = 模組對外的**臉**，外面的人只認得它
- 私有 sub-component 也放這裡（container 的 `ProfileTab`）——「私有 → 發現要共享 → 上抽」是自然的成長路徑，不是一開始就猜
- 入口 impl 用「模組名」：一律叫 `Component.tsx` 的話，editor 開一排 tab 全同名、Cmd+P 分不出誰是誰

`components` vs `containers` 一句判準：**「換個 feature 還能用嗎？」** 能 → components（可重用、不綁資料）；綁死這個 feature 的資料 / 流程 / CRUD → containers。**containers 是「把 components 跟資料接起來」的地方，components 對它一無所知。**
