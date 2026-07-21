// Runs after `docs:api` copies the generated en API docs into docs/zh-TW/api.
// Prepends the same "rendered in English" note the zh changelog page carries,
// so zh readers know the API reference is intentionally untranslated.
import fs from 'node:fs';

const file = 'docs/zh-TW/api/index.md';
const note = '> API 參考文件由 TypeDoc 自動生成，內容以英文原文呈現。\n\n';

fs.writeFileSync(file, note + fs.readFileSync(file, 'utf-8'));
