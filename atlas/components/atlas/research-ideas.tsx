'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Bookmark, ArrowUpRight, X } from 'lucide-react';
import { researchHref } from '@/lib/research-explorer';
import { parseWorkspace, type Candidate } from '@/lib/discovery';
export const researchIdeasKey = 'market-atlas-research-ideas-v1';
export interface ResearchIdea {
  id: string;
  market: string;
  node: string;
  age: string;
  label: string;
  hypothesis: string;
  question: string;
  version: string;
}
export function readResearchIdeas(): ResearchIdea[] {
  const parsed: unknown = JSON.parse(
    localStorage.getItem(researchIdeasKey) ?? '[]',
  );
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is ResearchIdea =>
      !!item &&
      typeof item === 'object' &&
      [
        'id',
        'market',
        'node',
        'age',
        'label',
        'hypothesis',
        'question',
        'version',
      ].every((k) => typeof item[k] === 'string' && item[k].length < 2000) &&
      /^[a-z_]+$/.test(item.market) &&
      /^[a-z_~]+$/.test(item.node) &&
      /^(20|30|40|50|60|70)?$/.test(item.age),
  );
}
export function ResearchIdeas() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<ResearchIdea[]>([]),
    [error, setError] = useState('');
  const [previous, setPrevious] = useState<Candidate[]>([]);
  const [editing, setEditing] = useState<ResearchIdea | null>(null);
  const show = () => {
    try {
      setItems(readResearchIdeas());
      setPrevious(
        parseWorkspace(localStorage.getItem('market-atlas.workspace.v1'))
          .candidates,
      );
      setError('');
    } catch {
      setError('저장된 아이디어를 읽을 수 없습니다.');
    }
    dialog.current?.showModal();
  };
  const saveEdit = () => {
    if (!editing) return;
    try {
      const updated = readResearchIdeas().map((item) =>
        item.id === editing.id
          ? {
              ...item,
              hypothesis: editing.hypothesis,
              question: editing.question,
            }
          : item,
      );
      localStorage.setItem(researchIdeasKey, JSON.stringify(updated));
      setItems(updated);
      setEditing(null);
      setError('');
    } catch {
      setError('변경 내용을 저장하지 못했습니다.');
    }
  };
  return (
    <>
      <button className="research-ideas-open" onClick={show}>
        <Bookmark size={14} /> 저장한 아이디어
      </button>
      <dialog ref={dialog} className="research-ideas-dialog">
        <header>
          <div>
            <small>IDEA WORKSPACE</small>
            <h2>다음에 검증할 사업 가설</h2>
          </div>
          <button
            aria-label="아이디어 목록 닫기"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </header>
        {error ? (
          <p>{error}</p>
        ) : items.length ? (
          <div>
            {items.map((item) => (
              <article key={item.id}>
                <Link
                  href={researchHref(item.market, item.node, item.age)}
                  onClick={() => dialog.current?.close()}
                >
                  <h3>
                    {item.label}
                    {item.age ? ' · ' + item.age + '대' : ''}
                  </h3>
                  <ArrowUpRight size={16} />
                </Link>
                <small>사업 가설</small>
                <p>{item.hypothesis}</p>
                <small>검증할 질문</small>
                <p>{item.question}</p>
                <span>열면 현재 추정 기준으로 다시 계산합니다.</span>
                <button
                  className="research-idea-edit"
                  onClick={() => setEditing(item)}
                >
                  가설·검증 질문 수정
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="research-ideas-empty">
            관심 있는 집단을 선택하고 ‘아이디어 저장’을 누르세요.
            <br />
            사업 가설과 확인할 질문을 함께 모아둘 수 있습니다.
          </p>
        )}
        {editing && (
          <section className="research-idea-editor">
            <h3>{editing.label}</h3>
            <label>
              사업 가설
              <textarea
                maxLength={2000}
                value={editing.hypothesis}
                onChange={(e) =>
                  setEditing({ ...editing, hypothesis: e.target.value })
                }
              />
            </label>
            <label>
              다음 검증 질문
              <textarea
                maxLength={2000}
                value={editing.question}
                onChange={(e) =>
                  setEditing({ ...editing, question: e.target.value })
                }
              />
            </label>
            <div>
              <button onClick={saveEdit}>변경 저장</button>
              <button onClick={() => setEditing(null)}>취소</button>
            </div>
          </section>
        )}
        {previous.length > 0 && (
          <section className="research-previous-ideas">
            <h3>이전에 저장한 아이디어 · {previous.length}개</h3>
            <p>
              기존 메모는 보존했습니다. 조건을 열면 외부 근거 연결 여부를
              확인합니다.
            </p>
            {previous.map((item) => (
              <article key={item.key}>
                <Link
                  href={'/atlas/segments/' + item.ids.join('~')}
                  onClick={() => dialog.current?.close()}
                >
                  <h3>{item.label}</h3>
                  <ArrowUpRight size={14} />
                </Link>
                <p>{item.hypothesis}</p>
                <p>{item.nextStep}</p>
                {item.evidence && <p>직접 기록한 근거: {item.evidence}</p>}
                <small>이전 산식의 인구·금액은 재사용하지 않습니다.</small>
              </article>
            ))}
          </section>
        )}
        <footer>
          이 브라우저에 저장됩니다. 전국 인구나 개인별 원자료를 저장하지
          않습니다.
        </footer>
      </dialog>
    </>
  );
}
