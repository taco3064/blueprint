export interface DiscussionNode {
  number: number;
  title: string;
  bodyText: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  number: number;
  title: string;
  preview: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
}

export const PREVIEW_LINES = 3;

const MEANINGFUL = /[\p{L}\p{N}]/u;

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

const sameText = (left: string, right: string) =>
  collapse(left).toLowerCase() === collapse(right).toLowerCase();

export function preview(title: string, bodyText: string): string[] {
  const lines = bodyText.split(/\r?\n/).map(collapse).filter((line) => MEANINGFUL.test(line));
  const body = lines.length > 0 && sameText(lines[0], title) ? lines.slice(1) : lines;

  return body.slice(0, PREVIEW_LINES);
}

export function project(nodes: DiscussionNode[]): Evidence[] {
  return nodes
    .map(({ number, title, bodyText, url, createdAt, updatedAt }) => ({
      number,
      title,
      preview: preview(title, bodyText),
      url,
      createdAt,
      updatedAt,
    }))
    .sort((left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.number - left.number);
}
