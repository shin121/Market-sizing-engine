# Phase 2 safety, targetability, and activation

## Evidence boundaries

Synthetic narrative attributes are hypotheses and must never be presented as facts about real people. Cluster-level observed evidence is limited to the synthetic sample, official calibration weights, revision-pinned semantic embeddings, derived lexical/structured features, support, and stability. Motivation labels, jobs, barriers, triggers, and creative angles are interpretations. Platform availability and person-level membership are not observed.

Population, interpretation, and targetability confidence are separate:

- population confidence asks whether the parent universe and conditional count are observed;
- interpretation confidence asks whether a stable, supported cluster coheres with the post-fit label;
- targetability confidence asks whether an activation mechanism is lawfully and technically verified.

A high cluster stability never upgrades an unobserved population universe or an unverified advertising audience.

## Targetability classes

- `directly_targetable`: allowed only with current, documented platform evidence. The current build emits none by assumption.
- `proxy_targetable`: broad, non-sensitive observable proxies may be tested; platform existence remains unverified.
- `contextual_only`: use content/context rather than inferred identity.
- `first_party_data_required`: activation requires consented, purpose-limited first-party classification.
- `creative_only`: use only as a message hypothesis, not an audience.
- `not_allowed`: do not activate.

Every activation row says `unverified_do_not_claim` unless external evidence is registered. The JSON contract is `contracts/phase2_activation_payload.schema.json`.

## Minors and sensitive domains

Minors are guardian/household-centered. Adult Nemotron narratives are never used to invent a child's motivation. Parenting/childcare feature activation is contextual or first-party-data-required, and direct minor targeting is excluded. Health and finance profiles prohibit diagnosis, vulnerability, creditworthiness, or other sensitive person-level inference.

The feedback endpoint rejects direct identifiers and stores aggregate counts only. Rare or biased observations are held for review. Representative IDs refer to synthetic rows; narrative text is not exposed in representative summaries or the cross-domain joint sample.

## Creative validation

A creative brief is a hypothesis: one job, one barrier, possible message angles, required product proof, exclusions, and a randomized holdout plan. Claims need product-specific substantiation. Optimize incremental outcomes and retention, not clicks alone. Preserve control cells, pre-register stop rules, and review disparate or vulnerable-group effects before broader use.

## Cross-domain safety

Domain joints are computed on the same synthetic adult record. Person, household, establishment, and enterprise signals are not bridged silently. A generic mixed-unit request returns `not_estimable`; a versioned acceptance query may use a documented adult decision-maker or owner-operator proxy, an official output-unit control, and a wide E-grade scenario overlay. Missing evidence is never replaced with zero or an independence product, and the bridge never asserts a one-to-one person/entity conversion.
