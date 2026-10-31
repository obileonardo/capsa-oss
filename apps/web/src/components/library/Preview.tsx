/* Card previews (approved mockup): paper excerpt for prompts, a dark code block for MCP servers, skills and commands,
 * a quote for techniques and tools, numbered steps for workflows, highlighted [blanks] for templates.
 * Decorative duplicates of the record's own text, so they are hidden from screen readers (the title link names the card). */
import { Fragment } from 'react';
import type { Artifact } from '@/lib/types';
import { fillParts } from './lib';
import { previewOf, tokenizeCode } from './look';
import { CardImage } from './ItemImage';
import s from './library.module.css';

export default function Preview({ a }: { a: Artifact }) {
  // an image item shows its picture; a prompt kept with an image (#88) shows its words, and the picture when it has none
  if ((a.image || a.refId) && (a.type === 'reference' || !a.exact)) return <CardImage a={a} />;
  const p = previewOf(a);
  if (p.kind === 'paper') {
    return <div className={s.paper} aria-hidden>{p.head && <div className={s.paperHead}>{p.head}</div>}{p.text}</div>;
  }
  if (p.kind === 'template') {
    return (
      <div className={`${s.paper} ${s.paperSans}`} aria-hidden>
        <div className={s.paperHead}>{p.head}</div>
        <div className={s.tpl}>
          {fillParts(p.text ?? '', {}).map((x, i) => (x.name ? <em key={i}>{x.name}</em> : <Fragment key={i}>{x.text}</Fragment>))}
        </div>
      </div>
    );
  }
  if (p.kind === 'steps') {
    return (
      <div className={s.steps} aria-hidden>
        {p.steps!.map((t, i) => <div key={i}><b>{i + 1}</b><span>{t}</span></div>)}
      </div>
    );
  }
  if (p.kind === 'code') {
    return (
      <div className={s.code} aria-hidden>
        <div className={s.codeBar}><i /><i /><i /></div>
        {p.comment && <div className={s.tc}>{p.comment}</div>}
        {p.isQuote !== undefined
          ? <div className={p.isQuote ? s.ts : undefined}>{p.text}</div>
          : tokenizeCode(p.text ?? '').map((line, i) => (
            <div key={i} className={s.codeLine}>{line.length ? line.map((t, j) => <span key={j} className={t.c ? s[`t${t.c}`] : undefined}>{t.t}</span>) : ' '}</div>
          ))}
      </div>
    );
  }
  return (
    <div className={s.big} aria-hidden>
      <div className={s.q}>
        {p.isQuote && <span className={s.qMark}>“</span>}
        <span className={s.qText}>{p.text}</span>
      </div>
    </div>
  );
}
