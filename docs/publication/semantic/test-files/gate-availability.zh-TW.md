只有 `architecture.testFiles: []` 會讓 `testFilename` 無法啟用：這條規則沒有可命名的檔案。宣告後沒有匹配任何掃描檔案的 glob 仍會成為關卡的檔案範圍，而且可能在其他位置匹配到檔案。
