BEGIN;

-- Supports v_estimate_lineage and getArchetype validation-gap enrichment.
-- The leading equality key matches the correlated predicate; priority/id match
-- the stable JSON aggregation order. INCLUDE keeps the published gap payload
-- available to index-only plans. The partial predicate excludes unrelated rows.
CREATE INDEX IF NOT EXISTS validation_gap_estimate_lineage_idx
    ON validation_gap (estimate_id, priority, validation_gap_id)
    INCLUDE (
        gap_type,
        description,
        impact,
        verification_question,
        recommended_source,
        expected_improvement,
        status
    )
    WHERE estimate_id IS NOT NULL;

-- Supports v_archetype_search and getArchetype's archetype-side gap predicate.
-- The same order is used by detailed gap lists, while the partial predicate
-- keeps the index limited to rows that can satisfy archetype lookups.
CREATE INDEX IF NOT EXISTS validation_gap_archetype_lineage_idx
    ON validation_gap (archetype_id, priority, validation_gap_id)
    INCLUDE (
        gap_type,
        description,
        impact,
        verification_question,
        recommended_source,
        expected_improvement,
        status
    )
    WHERE archetype_id IS NOT NULL;

-- Supports the default estimate-lineage page order so LIMIT can bound lateral
-- lineage enrichment to the requested page instead of all estimates.
CREATE INDEX IF NOT EXISTS estimate_updated_page_idx
    ON estimate (updated_at DESC, estimate_id);

-- Supports the same page order when listEstimates applies its status filter.
CREATE INDEX IF NOT EXISTS estimate_status_updated_page_idx
    ON estimate (status, updated_at DESC, estimate_id);

-- Supports getSubtype's reverse allocation lookup and count-descending order.
-- phase1_archetype_id also supplies the following archetype join key.
CREATE INDEX IF NOT EXISTS subtype_allocation_subtype_count_idx
    ON subtype_allocation (subtype_id, count_base DESC, phase1_archetype_id);

COMMENT ON INDEX validation_gap_estimate_lineage_idx IS
    'Partial covering index for estimate validation-gap lineage ordered by priority and validation_gap_id.';

COMMENT ON INDEX validation_gap_archetype_lineage_idx IS
    'Partial covering index for archetype validation-gap lineage ordered by priority and validation_gap_id.';

COMMENT ON INDEX estimate_updated_page_idx IS
    'Ordering index for the default updated_at-descending estimate-lineage page.';

COMMENT ON INDEX estimate_status_updated_page_idx IS
    'Filter and ordering index for status-scoped estimate-lineage pages.';

COMMENT ON INDEX subtype_allocation_subtype_count_idx IS
    'Reverse subtype-allocation lookup ordered by count_base for subtype lineage.';

COMMIT;
