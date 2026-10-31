/* A deliberately small Markdown renderer for the brief preview (the subset buildBrief emits):
 * headings, paragraphs, nested "- " lists, "> " quotes, "---", **bold**, `code`. Builds React nodes, never HTML strings. */
import { Fragment, type ReactNode } from 'react';

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else out.push(<code key={`${key}-${i++}`}>{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface Item { text: string; children: Item[] }

export function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const Tag = (['h1', 'h2', 'h3'] as const)[h[1].length - 1];
      blocks.push(<Tag key={k++}>{inline(h[2], `h${k}`)}</Tag>);
      i++; continue;
    }
    if (/^---+\s*$/.test(line)) { blocks.push(<hr key={k++} />); i++; continue; }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={k++}>{inline(q.join(' '), `q${k}`)}</blockquote>);
      continue;
    }
    if (/^\s*- /.test(line)) {
      const root: Item[] = [];
      const stack: { indent: number; list: Item[] }[] = [{ indent: 0, list: root }];
      while (i < lines.length && /^\s*- /.test(lines[i])) {
        const indent = lines[i].match(/^\s*/)![0].length;
        const item: Item = { text: lines[i].replace(/^\s*- /, ''), children: [] };
        while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
        const top = stack[stack.length - 1];
        if (indent > top.indent && top.list.length) {
          const parent = top.list[top.list.length - 1];
          stack.push({ indent, list: parent.children });
          parent.children.push(item);
        } else top.list.push(item);
        i++;
      }
      const render = (xs: Item[], p: string): ReactNode => (
        <ul>{xs.map((x, j) => <li key={j}>{inline(x.text, `${p}-${j}`)}{x.children.length > 0 && render(x.children, `${p}-${j}`)}</li>)}</ul>
      );
      blocks.push(<Fragment key={k++}>{render(root, `l${k}`)}</Fragment>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\s*- |---)/.test(lines[i])) para.push(lines[i++]);
    const text = para.join(' ');
    const em = text.match(/^_(.+)_$/); // whole-line emphasis only, so URLs with underscores stay intact
    blocks.push(<p key={k++}>{em ? <em>{inline(em[1], `p${k}`)}</em> : inline(text, `p${k}`)}</p>);
  }
  return <div className={className}>{blocks}</div>;
}
