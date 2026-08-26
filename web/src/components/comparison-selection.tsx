"use client";

import { Check, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

type SelectionItem = {
  id: string;
  label: string;
  kind?: string;
};

const STORAGE_VERSION = "v1";
const STORAGE_KEY = `market-atlas-comparison-selection:${STORAGE_VERSION}`;
const MAX_ITEMS = 5;
const EMPTY_SELECTION: SelectionItem[] = [];
const listeners = new Set<() => void>();
let cachedSelection: SelectionItem[] | null = null;

function readSelection(): SelectionItem[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim().slice(0, 240) : "";
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{
        id,
        label: typeof record.label === "string" && record.label.trim() ? record.label.trim().slice(0, 160) : id,
        kind: typeof record.kind === "string" ? record.kind.trim().slice(0, 40) : undefined,
      }];
    }).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function writeSelection(items: SelectionItem[]) {
  const seen = new Set<string>();
  const next = items.flatMap((item) => {
    const id = item.id.trim().slice(0, 240);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: item.label.trim().slice(0, 160) || id, kind: item.kind?.trim().slice(0, 40) }];
  }).slice(0, MAX_ITEMS);
  if (cachedSelection && JSON.stringify(cachedSelection) === JSON.stringify(next)) return;
  cachedSelection = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The in-memory tray remains usable when browser storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

function selectionSnapshot() {
  if (cachedSelection === null) cachedSelection = readSelection();
  return cachedSelection;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useComparisonSelection() {
  return useSyncExternalStore(subscribe, selectionSnapshot, () => EMPTY_SELECTION);
}

function comparisonHref(items: SelectionItem[]) {
  if (!items.length) return "/compare";
  return `/compare?ids=${encodeURIComponent(items.map((item) => item.id).join(","))}`;
}

export function AddToComparisonButton({ item }: { item: SelectionItem }) {
  const router = useRouter();
  const selection = useComparisonSelection();

  const selected = selection.some((candidate) => candidate.id === item.id);
  const full = selection.length >= MAX_ITEMS && !selected;

  function add() {
    const current = selectionSnapshot();
    if (current.some((candidate) => candidate.id === item.id)) {
      router.push(comparisonHref(current));
      return;
    }
    if (current.length >= MAX_ITEMS) return;
    const next = [...current, item];
    writeSelection(next);
    router.push(comparisonHref(next));
  }

  return (
    <button className="button" type="button" onClick={add} disabled={full}>
      {selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
      {selected ? "비교 목록 보기" : full ? "비교 목록이 가득 참" : "비교에 담기"}
    </button>
  );
}

export function ComparisonSelection({
  selectedIds,
  resolvedItems,
}: {
  selectedIds: string[];
  resolvedItems: SelectionItem[];
}) {
  const router = useRouter();
  const storedSelection = useComparisonSelection();
  const resolvedById = new Map([...storedSelection, ...resolvedItems].map((item) => [item.id, item]));
  const selection = selectedIds.length
    ? selectedIds.map((id) => resolvedById.get(id) ?? { id, label: id }).slice(0, MAX_ITEMS)
    : storedSelection;
  const selectedKey = selectedIds.join(",");
  const resolvedKey = JSON.stringify(resolvedItems);

  useEffect(() => {
    const stored = selectionSnapshot();
    const currentIds = selectedKey ? selectedKey.split(",") : [];
    if (!currentIds.length) {
      if (stored.length) router.replace(comparisonHref(stored));
      return;
    }
    const currentResolved = JSON.parse(resolvedKey) as SelectionItem[];
    const known = new Map([...stored, ...currentResolved].map((item) => [item.id, item]));
    const next = currentIds.map((id) => known.get(id) ?? { id, label: id }).slice(0, MAX_ITEMS);
    writeSelection(next);
  }, [resolvedKey, router, selectedKey]);

  function commit(next: SelectionItem[]) {
    writeSelection(next);
    router.push(comparisonHref(next));
  }

  return (
    <section className="comparison-selection" aria-label="비교 목록">
      <div>
        <span>COMPARE TRAY</span>
        <strong>{selection.length.toLocaleString("ko-KR")} / {MAX_ITEMS}</strong>
      </div>
      {selection.length ? (
        <ul>
          {selection.map((item) => (
            <li key={item.id}>
              <span><strong>{item.label}</strong><small>{item.kind ?? item.id}</small></span>
              <button type="button" onClick={() => commit(selection.filter((candidate) => candidate.id !== item.id))} aria-label={`${item.label} 비교 목록에서 제거`}><X aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      ) : <p>아직 선택한 세그먼트가 없습니다.</p>}
      <div className="comparison-selection-actions">
        {selection.length < MAX_ITEMS ? <Link href="/explore" className="button"><Plus aria-hidden="true" /> 다른 세그먼트 추가</Link> : null}
        {selection.length ? <button type="button" className="button button-quiet" onClick={() => commit([])}><Trash2 aria-hidden="true" /> 목록 비우기</button> : null}
      </div>
      {selection.length === 1 ? <small className="comparison-selection-hint">미리보려면 후보를 하나 이상 더 담으세요.</small> : null}
    </section>
  );
}
