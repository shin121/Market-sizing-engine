export const SEGMENT_CONDITION_LIMITS = {
  maxDepth: 12,
  maxNodes: 1_024,
  maxArrayItems: 256,
  maxObjectKeys: 64,
  maxStringCharacters: 16_000,
  maxTotalStringCharacters: 64_000,
} as const;

export function assertSegmentConditionPayloadLimits(value: unknown): void {
  let nodes = 0;
  let totalStringCharacters = 0;
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > SEGMENT_CONDITION_LIMITS.maxNodes) throw new Error("segment_condition_node_limit_exceeded");
    if (current.depth > SEGMENT_CONDITION_LIMITS.maxDepth) throw new Error("segment_condition_depth_limit_exceeded");
    if (typeof current.value === "string") {
      if (current.value.length > SEGMENT_CONDITION_LIMITS.maxStringCharacters) {
        throw new Error("segment_condition_string_limit_exceeded");
      }
      totalStringCharacters += current.value.length;
      if (totalStringCharacters > SEGMENT_CONDITION_LIMITS.maxTotalStringCharacters) {
        throw new Error("segment_condition_total_string_limit_exceeded");
      }
      continue;
    }
    if (Array.isArray(current.value)) {
      if (current.value.length > SEGMENT_CONDITION_LIMITS.maxArrayItems) {
        throw new Error("segment_condition_array_limit_exceeded");
      }
      for (const child of current.value) stack.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    if (current.value && typeof current.value === "object") {
      const entries = Object.entries(current.value as Record<string, unknown>);
      if (entries.length > SEGMENT_CONDITION_LIMITS.maxObjectKeys) {
        throw new Error("segment_condition_object_key_limit_exceeded");
      }
      for (const [key, child] of entries) {
        totalStringCharacters += key.length;
        if (totalStringCharacters > SEGMENT_CONDITION_LIMITS.maxTotalStringCharacters) {
          throw new Error("segment_condition_total_string_limit_exceeded");
        }
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
}
