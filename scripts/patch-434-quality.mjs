import fs from 'node:fs';

function replaceBetween(file, start, end, replacement) {
  const text = fs.readFileSync(file, 'utf8');
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);

  if (from < 0 || to < 0) {
    throw new Error(`markers missing in ${file}`);
  }

  fs.writeFileSync(file, text.slice(0, from) + replacement + text.slice(to));
}

const modules = Buffer.from('ZnVuY3Rpb24gdmFsaWRhdGVNb2R1bGVzKG1vZHVsZXM6IE1vZHVsZURlZltdIHwgdW5kZWZpbmVkKTogdm9pZCB7CiAgaWYgKG1vZHVsZXMgPT09IHVuZGVmaW5lZCkgewogICAgcmV0dXJuOwogIH0KCiAgdmFsaWRhdGVNb2R1bGVMaXN0KG1vZHVsZXMpOwoKICBjb25zdCBleGFjdCA9IG5ldyBTZXQ8c3RyaW5nPigpOwogIGNvbnN0IGZvbGRlZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7CgogIGZvciAoY29uc3QgbW9kdWxlIG9mIG1vZHVsZXMpIHsKICAgIHZhbGlkYXRlTW9kdWxlKG1vZHVsZSwgZXhhY3QsIGZvbGRlZCk7CiAgfQp9CgpmdW5jdGlvbiB2YWxpZGF0ZU1vZHVsZUxpc3QobW9kdWxlczogTW9kdWxlRGVmW10pOiB2b2lkIHsKICBpZiAoIUFycmF5LmlzQXJyYXkobW9kdWxlcykgfHwgbW9kdWxlcy5sZW5ndGggPT09IDApIHsKICAgIHRocm93IG5ldyBFcnJvcigKICAgICAgJ2FyY2hpdGVjdHVyZS5tb2R1bGVzIG11c3QgYmUgYSBub24tZW1wdHkgYXJyYXkgd2hlbiBwcm92aWRlZC4gJwogICAgICArICdPbWl0IGl0IGZvciBsYXllci1maXJzdCB0b3BvbG9neS4nLAogICAgKTsKICB9Cn0KCmZ1bmN0aW9uIHZhbGlkYXRlTW9kdWxlKAogIG1vZHVsZTogTW9kdWxlRGVmLAogIGV4YWN0OiBTZXQ8c3RyaW5nPiwKICBmb2xkZWQ6IE1hcDxzdHJpbmcsIHN0cmluZz4sCik6IHZvaWQgewogIGlmICghbW9kdWxlIHx8IHR5cGVvZiBtb2R1bGUubmFtZSAhPT0gJ3N0cmluZycgfHwgIW1vZHVsZS5uYW1lLnRyaW0oKSkgewogICAgdGhyb3cgbmV3IEVycm9yKCdFYWNoIG1vZHVsZSBtdXN0IGhhdmUgYSBub24tZW1wdHkgbmFtZS4nKTsKICB9CgogIHJlamVjdFVua25vd25LZXlzKG1vZHVsZSwgWyduYW1lJywgJ2RvZXMnXSwgYG1vZHVsZSAiJHttb2R1bGUubmFtZX0iYCk7CiAgdmFsaWRhdGVNb2R1bGVGb2xkZXJOYW1lKG1vZHVsZS5uYW1lKTsKICByZWplY3RNb2R1bGVDb2xsaXNpb25zKG1vZHVsZS5uYW1lLCBleGFjdCwgZm9sZGVkKTsKICBleGFjdC5hZGQobW9kdWxlLm5hbWUpOwogIGZvbGRlZC5zZXQobW9kdWxlLm5hbWUudG9Mb2NhbGVMb3dlckNhc2UoJ2VuLVVTJyksIG1vZHVsZS5uYW1lKTsKfQoKZnVuY3Rpb24gdmFsaWRhdGVNb2R1bGVGb2xkZXJOYW1lKG5hbWU6IHN0cmluZyk6IHZvaWQgewogIGNvbnN0IHVuc2FmZSA9ICEvXltBLVphLXowLTkuXy1dKyQvLnRlc3QobmFtZSkgfHwgbmFtZSA9PT0gJy4nIHx8IG5hbWUgPT09ICcuLic7CgogIGlmICh1bnNhZmUpIHsKICAgIHRocm93IG5ldyBFcnJvcigKICAgICAgYE1vZHVsZSAiJHtuYW1lfSIgaXMgbm90IGEgc2FmZSBvbmUtc2VnbWVudCBzb3VyY2Utcm9vdCBmb2xkZXIgbmFtZSDigJQgYAogICAgICArICdzdGljayB0byBsZXR0ZXJzLCBkaWdpdHMsICIuIiwgIl8iLCAiLSIuJywKICAgICk7CiAgfQp9CgpmdW5jdGlvbiByZWplY3RNb2R1bGVDb2xsaXNpb25zKAogIG5hbWU6IHN0cmluZywKICBleGFjdDogU2V0PHN0cmluZz4sCiAgZm9sZGVkOiBNYXA8c3RyaW5nLCBzdHJpbmc+LAopOiB2b2lkIHsKICBpZiAoZXhhY3QuaGFzKG5hbWUpKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoYER1cGxpY2F0ZSBtb2R1bGUgbmFtZTogIiR7bmFtZX0iLmApOwogIH0KCiAgY29uc3QgY29sbGlzaW9uID0gZm9sZGVkLmdldChuYW1lLnRvTG9jYWxlTG93ZXJDYXNlKCdlbi1VUycpKTsKCiAgaWYgKGNvbGxpc2lvbiAhPT0gdW5kZWZpbmVkKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoCiAgICAgIGBNb2R1bGUgbmFtZXMgIiR7Y29sbGlzaW9ufSIgYW5kICIke25hbWV9IiBjb2xsaWRlIG9uIGNhc2UtaW5zZW5zaXRpdmUgZmlsZXN5c3RlbXMuYCwKICAgICk7CiAgfQp9Cgo=', 'base64').toString('utf8');

replaceBetween(
  'src/config/defineBlueprint.ts',
  'function validateModules(',
  'function validateAdditionalAliases(',
  modules,
);

{
  const file = 'src/config/defineBlueprint.ts';
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(
    "    throw new Error('architecture.module was removed in Blueprint 4.0 — move layout / entry onto each layer. module.private has no replacement.');",
    "    throw new Error(\n      'architecture.module was removed in Blueprint 4.0 — move layout / entry onto each layer. '\n      + 'module.private has no replacement.',\n    );",
  );
  fs.writeFileSync(file, text);
}

{
  const file = 'src/emit/lint/lint.ts';
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(
    "\n  const entries = Object.fromEntries(\n    resolved.layers.map((layer) => [layer.name, layer.unit.entry]),\n  );\n",
    '',
  );
  fs.writeFileSync(file, text);
}
