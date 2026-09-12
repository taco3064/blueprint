`architecture.testFiles` 只會讓 `**/*.test.{js,jsx,ts,tsx,vue}` / `**/*.spec.{js,jsx,ts,tsx,vue}` 實際匹配到的檔案豁免於結構規則、度量關卡、inspect 分析與相依圖；測試專用規則仍會套用到相同 glob。掃描到、但沒有任何設定 glob 匹配的檔案，仍是一般原始碼。
