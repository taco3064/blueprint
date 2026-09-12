**只有匹配 `architecture.testFiles` 的測試檔才會被排除。** `**/*.test.{js,jsx,ts,tsx,vue}` / `**/*.spec.{js,jsx,ts,tsx,vue}` 匹配到的檔案，其匯入不會增加 unit 的影響範圍。掃描到、但沒有任何設定 glob 匹配的檔案仍是一般原始碼，因此其匯入會被計入。
