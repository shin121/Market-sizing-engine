# Phase 3R–7R Research Workflow

최종 갱신: 2026-08-26

## 원칙

AI Research는 Baseline을 보완하는 제안 계층이다. AI가 Production estimate를 직접 수정하지 않는다.

```text
Baseline → Research Job → Schema Validation → needs_review
        → Human Review → approved/rejected
        → typed factor/source materialization → 새 version
```

## Job 상태

`draft`, `queued`, `running`, `needs_review`, `approved`, `rejected`, `failed`, `cancelled`, `configuration_required`를 지원한다. 실패와 설정 누락은 결과를 만들어내지 않는다.

Provider가 설정된 뒤 `configuration_required` 또는 `failed` Job만 재등록할 수 있다. 사용자가 외부전송 확인을 누르면 immutable canonical input을 유지한 채 status와 step을 `queued`로 되돌리고 audit/event를 남긴다.

## 요청 Payload

- `research_question`
- `target_segment`
- `target_variable`
- `existing_baseline`
- geography/reference-year 요구사항
- 허용된 source/evidence policy

이 값은 OpenAI provider에 전송되는 외부 데이터다. API key 재사용 허가는 payload 전송 허가와 동일하지 않다. 실제 prompt·target·baseline 전송은 사용자 또는 운영 정책의 명시적 승인을 받아야 한다.

## 구조화 결과

Provider response는 Zod/JSON Schema로 다음을 검증한다.

- proposed factors와 Low/Base/High
- denominator, geography, reference year
- sources/citations
- inference method와 limitations
- confidence components
- variables to verify
- affected segments와 recommended action

숫자 순서, URL, 필수 문자열, confidence 범위, source 구조가 맞지 않으면 review queue에 올리지 않고 실패 처리한다.

## Human Review

Review 화면은 기존값, 제안값, 변경 폭, formula, source, confidence 변화, 영향받는 segment와 예상 재계산을 보여준다. Reviewer는 승인, 수정 후 승인, 반려, 추가 조사, 기존값 유지를 선택한다.

승인에는 별도 확인 단계와 optimistic lock이 필요하다. 승인 결과는 typed factor/source ledger와 immutable review lineage로 저장되고, baseline을 수정하는 대신 새 version을 만든다.

## 현재 검증 상태

- 실제 OpenAI adapter, durable queue, retry, schema validation, review/materialization 경로: 구현 및 테스트 완료
- 장기 실행 worker와 별도-secret serverless cron run-once 경로: 구현 및 인증/DB 통합 테스트 완료
- 명시적 외부 전송 확인 헤더를 요구하는 사용자 즉시 실행 경로: 구현 및 단위 테스트 완료
- configuration-required 재등록과 payload 전송 확인 UI: 구현 및 테스트 완료
- provider disabled/key missing의 `configuration_required` 경로: 실제 Job으로 검증 완료
- Production에 가상 research 결과: 0건
- live provider request: payload 외부전송 승인 대기

현재 clean Production의 실제 Job `a2c6e72d-0bd7-4aff-bc2e-47995b26ad02`은 `configuration_required` 상태로 보존되어 있다. 승인 후 같은 실제 질문을 한 번 실행하고 `needs_review`까지만 자동 진행하며, 인간 승인 없이는 Baseline을 변경하지 않는다.
