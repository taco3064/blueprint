export function globToRegExp(glob: string): RegExp {
  let pattern = '';

  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];

    if (char === '*') {
      if (glob[i + 1] === '*') {
        pattern += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
        i += glob[i + 2] === '/' ? 2 : 1;
      } else {
        pattern += '[^/]*';
      }
    } else if (char === '?') {
      pattern += '[^/]';
    } else if (char === '{' && glob.includes('}', i)) {
      const end = glob.indexOf('}', i);
      const body = glob.slice(i + 1, end).split(',').map(escape).join('|');

      pattern += `(?:${body})`;
      i = end;
    } else {
      pattern += escape(char);
    }
  }

  return new RegExp(`^${pattern}$`);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
