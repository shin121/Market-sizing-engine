'use client';
import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BookmarkPlus, Check, Columns3, Lightbulb } from 'lucide-react';
import {
  candidateKey,
  makeCandidate,
  parseWorkspace,
  type Candidate,
  type Workspace,
} from '@/lib/discovery';
import { contextHref, type AtlasContext, type Summary } from '@/lib/atlas';

const STORAGE = 'market-atlas.workspace.v1';
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('atlas-workspace', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('atlas-workspace', callback);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(STORAGE);
  } catch {
    return null;
  }
}
const serverSnapshot = () => null;
export function useWorkspace() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const workspace = useMemo(() => parseWorkspace(raw), [raw]);
  const update = (fn: (w: Workspace) => Workspace) => {
    const next = fn(parseWorkspace(snapshot()));
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
      window.dispatchEvent(new Event('atlas-workspace'));
      return true;
    } catch {
      return false;
    }
  };
  return { workspace, update };
}
export function WorkspaceActions({
  summary,
  context,
}: {
  summary: Summary;
  context: AtlasContext;
}) {
  const { workspace, update } = useWorkspace();
  const [message, setMessage] = useState('');
  const key = candidateKey(summary.ids, context.moneyScope);
  const saved = workspace.candidates.some((c) => c.key === key);
  const compared = workspace.compare.includes(key);
  const save = (compare: boolean) => {
    if (compare && !compared && workspace.compare.length >= 3) {
      setMessage('비교는 최대 3개입니다. 비교 화면에서 하나를 빼 주세요.');
      return;
    }
    if (!saved && workspace.candidates.length >= 100) {
      setMessage('아이디어는 최대 100개입니다. 보드에서 정리해 주세요.');
      return;
    }
    const ok = update((w) => ({
      ...w,
      candidates: w.candidates.some((v) => v.key === key)
        ? w.candidates
        : [
            ...w.candidates,
            makeCandidate(
              summary.ids,
              context.moneyScope,
              summary.entity.label,
            ),
          ],
      compare: compare
        ? [...new Set([...w.compare, key])].slice(0, 3)
        : w.compare,
    }));
    setMessage(
      ok
        ? compare
          ? '비교에 담았습니다.'
          : '아이디어 보드에 저장했습니다.'
        : '브라우저 저장 공간을 사용할 수 없습니다.',
    );
  };
  return (
    <div className="workspace-actions">
      <button onClick={() => save(true)} disabled={!summary.ids.length}>
        <Columns3 size={14} />
        {compared ? '비교에 담김' : '비교에 담기'}
      </button>
      <button
        className="save-idea"
        onClick={() => save(false)}
        disabled={!summary.ids.length}
      >
        {saved ? <Check size={14} /> : <BookmarkPlus size={14} />}{' '}
        {saved ? '저장됨' : '아이디어 저장'}
      </button>
      {message && <output className="action-message">{message}</output>}
    </div>
  );
}
export function WorkspaceLinks({ context }: { context: AtlasContext }) {
  const { workspace } = useWorkspace();
  return (
    <>
      <Link
        className={context.view === 'compare' ? 'active' : ''}
        href={contextHref('compare', [], context)}
      >
        <Columns3 size={17} />
        세그먼트 비교 <small>{workspace.compare.length}</small>
      </Link>
      <Link
        className={context.view === 'ideas' ? 'active' : ''}
        href={contextHref('ideas', [], context)}
      >
        <Lightbulb size={17} />
        아이디어 보드 <small>{workspace.candidates.length}</small>
      </Link>
    </>
  );
}
export function candidateHref(candidate: Candidate) {
  return (
    '/atlas/segments/' +
    candidate.ids.join('~') +
    '?spend=' +
    encodeURIComponent(candidate.scope)
  );
}
