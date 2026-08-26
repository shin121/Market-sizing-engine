export type HighConfidencePersonalDataKind =
  | "email_address"
  | "resident_registration_number"
  | "phone_number"
  | "labeled_account_identifier"
  | "labeled_financial_account"
  | "detailed_street_address";

type DetectionRule = {
  kind: HighConfidencePersonalDataKind;
  pattern: RegExp;
};

// These rules intentionally cover only high-confidence identifiers. They are a
// fail-closed guard for obvious PII, not a claim that arbitrary prose can be
// proven anonymous with regular expressions.
const DETECTION_RULES: readonly DetectionRule[] = [
  {
    kind: "email_address",
    pattern: /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/iu,
  },
  {
    kind: "resident_registration_number",
    pattern: /(?:^|[^0-9])[0-9]{6}\s*-\s*[1-8][0-9]{6}(?:$|[^0-9])/u,
  },
  {
    kind: "phone_number",
    pattern: /(?:^|[^0-9])(?:(?:\+?82[-.\s]?)?0?1[016789][-.\s]?[0-9]{3,4}[-.\s]?[0-9]{4}|0(?:2|[3-6][0-9])[-.\s][0-9]{3,4}[-.\s][0-9]{4})(?:$|[^0-9])/u,
  },
  {
    kind: "labeled_account_identifier",
    pattern: /(?:계정|아이디|회원번호|고객번호|account|user(?:name)?)(?:\s+id)?\s*[:=#]\s*[a-z0-9._-]{4,}/iu,
  },
  {
    kind: "labeled_financial_account",
    pattern: /(?:계좌(?:번호)?|카드번호|account\s+number|card\s+number)\s*[:=#]?\s*[0-9][0-9\s-]{7,}[0-9]/iu,
  },
  {
    kind: "detailed_street_address",
    pattern: /(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도)\s+)?[가-힣]+(?:시|군|구)\s+[가-힣0-9·.-]+(?:로|길)\s+[0-9]+(?:-[0-9]+)?/u,
  },
];

const MAX_SCAN_NODES = 20_000;
const MAX_SCAN_CHARACTERS = 1_000_000;
const CANONICAL_UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu;

export function findHighConfidencePersonalData(value: unknown): HighConfidencePersonalDataKind[] {
  const findings = new Set<HighConfidencePersonalDataKind>();
  const stack: unknown[] = [value];
  const visited = new WeakSet<object>();
  let nodes = 0;
  let characters = 0;

  while (stack.length) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > MAX_SCAN_NODES) throw new Error("personal_data_scan_limit_exceeded");

    if (typeof current === "string") {
      characters += current.length;
      if (characters > MAX_SCAN_CHARACTERS) throw new Error("personal_data_scan_limit_exceeded");
      for (const rule of DETECTION_RULES) {
        // A canonical UUID can contain an accidental 010-1234-5678-shaped
        // substring across its groups. It is an internal identifier, not a
        // phone number. Mask it only for the phone rule so a UUID explicitly
        // labeled as an account/customer identifier is still rejected.
        const candidate = rule.kind === "phone_number"
          ? current.replace(CANONICAL_UUID_PATTERN, " ")
          : current;
        if (rule.pattern.test(candidate)) findings.add(rule.kind);
      }
      continue;
    }
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    stack.push(...Object.values(current as Record<string, unknown>));
  }

  return [...findings].sort();
}

export function assertNoHighConfidencePersonalData(value: unknown): void {
  const findings = findHighConfidencePersonalData(value);
  if (findings.length) {
    // Return only finding classes so rejected input is never copied into logs,
    // audits, or error payloads.
    throw new Error(`personal_data_not_allowed:${findings.join(",")}`);
  }
}
