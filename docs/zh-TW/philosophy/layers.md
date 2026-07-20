# 分層架構

**單向依賴流，每層單一職責。** 原則本身與框架無關（Vue 與 React 均成立），單元一一對應、沒有主從之分：`composable ↔ hook`、`context ↔ Context`、`SFC ↔ function component`、`service ↔ api client`。

```
pages/views → containers → components → hooks → services → assets/i18n
                  ⇢ contexts（僅限掛載 Provider）
       hooks ⇢ contexts（僅限取用 Context；selfOnly）
    contexts → services
```

## 單向依賴流的理由

1. 每層職責單一（hook 不匯入 component，因而保持為可重用的邏輯單元）
2. 資料歸屬一目瞭然，無須全文搜尋整個專案
3. 重構安全：跨層搬移檔案時，程式碼檢查會一次列出所有非法呼叫點
4. 新增一條依賴邊即等於修改 Blueprint 組態，迫使「此層是否確實應依賴彼層」的問題在審查階段浮現

## 各層職責

| 分層 | 職責 | 禁止事項 |
|---|---|---|
| `pages` | 頁面版型與 containers 的組裝；對應路由與 SEO | 不得放置商業邏輯；不得直接堆疊 components |
| `containers` | 單一功能的組裝、商業邏輯與資料增刪查改；持有狀態、呼叫 service、驅動導覽 | — |
| `components` | 可重用的介面元件，以呈現為主，可呼叫 hook | 不得操作路由；不得直接呼叫 service；不得持有應用程式狀態 |
| `hooks` | `inject` / `useContext` 僅得出現於此層；加工伺服器資料與共享狀態；**狀態儲存庫（Pinia / Zustand）為本層的私有物件** | 不得對外暴露原始的狀態儲存庫 |
| `contexts` | `provide` / `createContext` 僅得出現於此層；對外提供 Context 與 Provider | — |
| `services` | 網路存取原語；唯一可匯入 `axios`、唯一可呼叫 `fetch` 與 `WebSocket` 之處 | 僅回傳資料，不含介面或商業邏輯 |

**本架構不設 `stores` 與 `utils` 兩層。** 每個狀態儲存庫應有唯一擁有它的 hook 模組（該 hook 即為其對外介面），其他功能一律透過該 hook 讀取。至於 `utils/`，它是一個缺乏內聚性的雜物空間：任何「看似通用」的程式碼都會被放入其中、無限增長，最終成為所有模組共同依賴的耦合點。純函式應依「使用者是誰」歸屬：僅單一模組使用者，作為該模組的私有檔案；跨模組共用者，建立具名、依領域劃分的獨立模組，使其「掙得一個名字」。

## 功能資料夾 —— 模組的組成方式

```
components/
└─ Dropdown/
   ├─ index        ← 對外唯一入口（公開）
   ├─ Dropdown     ← 實作本體，檔名即模組名（不命名為 Component）
   ├─ hooks        ← 私有
   ├─ styles       ← 私有
   └─ types        ← 私有
```

- `index` 是模組對外的**門面**，外部僅認得此入口
- 私有子元件亦置於模組內（例如 container 內的 `ProfileTab`）——「先私有，確認需要共享時再上提」是自然的成長路徑，無須一開始便預測
- 實作檔以「模組名」命名：若一律命名為 `Component.tsx`，編輯器分頁與快速開啟功能將無從辨別

`components` 與 `containers` 的判別標準一句話：**「換一個功能場景還能使用嗎？」** 可以，屬於 components（可重用、不綁定資料）；綁定特定功能的資料、流程或增刪查改，屬於 containers。**containers 是「將 components 與資料接合」之處；components 對 containers 一無所知。**
