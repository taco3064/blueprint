每筆生成的結構 entry 都把 `**/*.test.{js,jsx,ts,tsx,vue}` / `**/*.spec.{js,jsx,ts,tsx,vue}` 帶在各自的 `ignores`；重組 entry 時若漏掉這些 ignores，就會開始管到匹配的測試檔。
