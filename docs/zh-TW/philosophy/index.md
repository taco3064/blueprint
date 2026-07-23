# 運作契約

這是 blueprint 的核心工程理念 —— 本章節不是延伸閱讀，`vuePreset()` / `reactPreset()` 就是以資料形式承載這裡的每一頁。`init` 會將這些信念轉譯到專案中，變成 ESLint 規則與 AI Agent 的守則，確保工程信念可以成為開發上的護欄，而非口頭支票。修改 config 中的 `principles` / `componentShape` / `playbook`，就是在修改專案裡這份內容的版本。

先誠實講一句：blueprint 是把「已經有人想好的架構」變成 code —— preset 的、或你 repo 既有的。它負責讀懂與把關，不會替你設計架構。

手冊闡述前端**元件與架構**的設計思維：分層架構、元件形狀、資料邊界、重構紀律。**同一組原則在 Vue 與 React 均成立** —— 兩者的結構對應一致，差異僅在 reactive 原語（`ref`/`computed` 對應 `useState`/`useMemo`）與生命週期 API。

本手冊的定位是**運作契約，而非討論文件**。凡以 AI Agent 協作的專案，建議於第一天即行導入 —— 自始將規則納入管控，專案便能在可控範圍內成長為預期的樣貌，而非等到接近失控時才回頭重構。

## 三級落點

手冊中每條規則落於以下三個位置之一：

| 級別 | 落點 | 意義 |
|---|---|---|
| ✅ | **lint／config** | 有對應規則支撐，由 lint 自動攔截；設定一次即可。 |
| ◐ | **lint（初篩）＋ Agent 守則** | lint 僅能標出「需要檢視的位置」（設為 warn 等級），結論交由程式碼審查判定。 |
| ○ | **Agent 守則** | 工具無法辨識（涉及語意、流程或人為判斷）—— 寫成行為規則，由 Agent 在每輪工作中自行遵守。 |

這就是 blueprint 的設計骨架：機器查得動的轉譯成 ESLint config；唯有審查能判定的轉譯成手冊與 Agent 守則。**lint 全數通過不等於架構合格** —— 這正是信念第六條。

## Blueprint 的承載方式

| 手冊章節 | Blueprint 載體 |
|---|---|
| 分層架構、模組形狀、套件歸屬 | `architecture` → `emitLint` 與 `inspect` |
| 九條核心信念 | `principles` → 手冊與 Agent 守則 |
| 元件形狀（七條軸線） | `componentShape` → 手冊與 Agent 守則 |
| 執行期負載／重構／協作 | `playbook` → 手冊與 Agent 守則 |
| 量化門檻與自訂規則 | `rules` → `emitLint`（內嵌外掛） |

延伸閱讀：[九條核心信念](/zh-TW/philosophy/beliefs) · [分層架構](/zh-TW/philosophy/layers) · [元件形狀](/zh-TW/philosophy/component-shape) · [工作紀律](/zh-TW/philosophy/discipline)
