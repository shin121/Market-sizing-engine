"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { statusDisplayLabel } from "@/components/ui";

type EventRecord = Record<string, unknown>;

const TERMINAL_STATUSES = new Set(["approved", "rejected", "failed", "cancelled"]);

function record(value: unknown): EventRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as EventRecord
    : {};
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sequence(event: EventRecord): number {
  const value = event.sequence_no ?? event.sequenceNo;
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
}

function eventDetail(event: EventRecord): string {
  const payload = record(event.payload);
  for (const key of ["message", "reason", "code", "note", "revisionId", "publicationVersionId"]) {
    const value = string(payload[key]);
    if (value) {
      if (value.includes("OPENAI_RESEARCH_ENABLED") || value.includes("OPENAI_API_KEY")) {
        return "Research Worker의 외부 AI 사용 설정과 API Credential을 확인하세요.";
      }
      return value === "configuration_required" ? "외부 AI 연결 설정이 필요합니다." : value;
    }
  }
  if (Object.keys(payload).length === 0) return "상세 없음";
  return JSON.stringify(payload).slice(0, 800);
}

function eventTypeLabel(value: string | null): string {
  const labels: Record<string, string> = {
    configuration_required: "외부 AI 설정 필요",
    created: "작업 생성",
    queued: "대기열 등록",
    started: "조사 시작",
    completed: "조사 완료",
    failed: "조사 실패",
    cancelled: "작업 취소",
  };
  return labels[value ?? ""] ?? "상태 변경";
}

export function ResearchJobEventStream({
  jobId,
  initialStatus,
  initialUpdatedAt,
  initialErrorCode,
  initialErrorMessage,
  initialEvents,
}: {
  jobId: string;
  initialStatus: string | null;
  initialUpdatedAt: string | null;
  initialErrorCode: string | null;
  initialErrorMessage: string | null;
  initialEvents: unknown[];
}) {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>(() => initialEvents.map(record));
  const [liveStatus, setLiveStatus] = useState(initialStatus);
  const [errorCode, setErrorCode] = useState(initialErrorCode);
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage);
  const [pollError, setPollError] = useState<string | null>(null);
  const cursor = useRef(Math.max(0, ...initialEvents.map((event) => sequence(record(event)))));
  const updatedAt = useRef(initialUpdatedAt);

  useEffect(() => {
    if (!jobId || TERMINAL_STATUSES.has(liveStatus ?? "")) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/research/jobs/${encodeURIComponent(jobId)}/events?after=${cursor.current}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`poll_failed_${response.status}`);
        const payload = record(await response.json());
        const incoming = Array.isArray(payload.events) ? payload.events.map(record) : [];
        const nextStatus = string(payload.status) ?? liveStatus;
        const nextUpdatedAt = string(payload.updated_at ?? payload.updatedAt);
        const nextErrorCode = string(payload.error_code ?? payload.errorCode);
        const nextErrorMessage = string(payload.error_message ?? payload.errorMessage);
        const changed = incoming.length > 0
          || nextStatus !== liveStatus
          || nextUpdatedAt !== updatedAt.current
          || nextErrorCode !== errorCode
          || nextErrorMessage !== errorMessage;
        if (incoming.length > 0) {
          cursor.current = Math.max(cursor.current, ...incoming.map(sequence));
          setEvents((current) => {
            const known = new Set(current.map(sequence));
            return [...current, ...incoming.filter((event) => !known.has(sequence(event)))];
          });
        }
        updatedAt.current = nextUpdatedAt;
        setLiveStatus(nextStatus);
        setErrorCode(nextErrorCode);
        setErrorMessage(nextErrorMessage);
        setPollError(null);
        if (changed) router.refresh();
      } catch (error) {
        if (!controller.signal.aborted) {
          setPollError(error instanceof Error ? error.message : "poll_failed");
        }
      } finally {
        if (!controller.signal.aborted) {
          const delay = liveStatus === "configuration_required" ? 5_000 : 1_500;
          timer = setTimeout(poll, delay);
        }
      }
    };

    timer = setTimeout(poll, liveStatus === "configuration_required" ? 5_000 : 1_500);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [errorCode, errorMessage, jobId, liveStatus, router]);

  return (
    <div>
      <p className="live-job-state" role="status">실시간 상태: <strong>{statusDisplayLabel(liveStatus)}</strong></p>
      {errorCode || errorMessage ? (
        <div className="notice-banner warning" role="alert">
          <div><strong>{errorCode === "configuration_required" ? "외부 AI 연결 설정 필요" : "리서치 작업 오류"}</strong><p>{eventDetail({ payload: { message: errorMessage } })}</p></div>
        </div>
      ) : null}
      {events.length ? (
        <div className="event-log">
          {events.map((event, index) => (
            <div key={string(event.research_job_event_id ?? event.eventId) ?? `${sequence(event)}-${index}`}>
              <time>{string(event.occurred_at ?? event.occurredAt) ?? "시각 미확인"}</time>
              <span>{eventTypeLabel(string(event.event_type ?? event.eventType))}</span>
              <p>{eventDetail(event)}</p>
            </div>
          ))}
        </div>
      ) : <p className="muted">기록된 이벤트가 없습니다.</p>}
      {pollError ? <small className="muted">실시간 상태를 다시 확인하고 있습니다.</small> : null}
    </div>
  );
}
