# Data, membership and estimation

> 이 문서는 현재 산식·외부 인구 보정·12/20개 산업 범위를 기준으로 합니다. 전수 검증은 [research-demand-sanity.json](../data/research-demand-sanity.json)을 사용합니다.

## Semantic families and extraction

The complete nine-shard corpus contains one million UUID-unique synthetic personas and 26 fields. There are no structured transactions, spend, income, purchase-frequency, WTP, competition or time-series fields. The source's lifestyle story format itself can create strong co-occurrences; measured lift is evidence of recurring text patterns, not consumer causality.

`config/atlas-features.json` proposes 125 regex-based features. 123 pass at least 150 eligible-record support: 20 markets, 53 commercial signals (behavior, need and channel), and 50 scoped interests/submarkets. Two second-hand features fail support and are excluded. The commercial extraction text uses seven lifestyle/general fields, excluding both professional persona and career ambitions. Submarkets use the corresponding narrative fields and require their parent market. Explicitly negative sentences are omitted conservatively; unmentioned does not mean absent in reality.

A human context review corrected four observed failure modes: “전문 상담사” describes a provider/aspiration, “옮기기” is not equipment purchasing, “한없이” is not a lack of time, and direct viewing of a historical place is not retail consultation. A paid-platform contact is distinguished from free creator following and from proven personal payment. Regression cases are in `tests/atlas_lexical_test.py`. This is a bounded lexical review, not an estimated precision/recall study.

Candidates are weighted co-occurring pairs of commercial features only, with at least one purchase/selection/engagement mechanism. Markets, ages, sexes and locations cannot define a type. Of all commercial pairs, 221 qualify after minimum population 18,000, support 400, discovery lift ≥1.08, held-out lift ≥1.04, held-out relative prevalence change <22%, semantic-dependency checks and at least five meaningful non-defining indexes. The split is deterministic 80%/20% by sorted UUID ordinal. This is internal stability checking, not validation against real consumer observations.

Candidates are ranked by population, association lift, non-defining signal divergence and industry breadth. Diversity selection limits one anchor to three selected bundles, a family to twelve, and overlapping bundles sharing a defining feature to Jaccard ≤0.68. 52 supported types remain; the target count is not filled with weaker duplicates. Mechanism-based names are composed from the observed defining features. No LLM invented memberships or narratives. The top 30 ordered by population were inspected before UI implementation.

## Membership, universe and ranges

A record's membership in type T is 1 if all of T's defining signals occur, otherwise 0. This is an explicit membership weight, not an invented fractional probability. Memberships overlap. 62.117% of calibrated consumers match at least one type; 33.329% match two or more. Summed memberships equal approximately 62.42 million versus a 44.105 million universe; the weighted mean is 1.415 memberships per consumer. The map area normalizes the sum of memberships and explicitly does not present an exhaustive population partition.

The 989,509 records aged 20+ are calibrated to 16 age-band × sex margins from the existing dated population control asset (`config/population-controls.json`). Its total is 44,105,000 people, reference 2024-11-01. The official upstream publication was not independently re-ingested. The 10,491 19-year-olds have no compatible control and are excluded from absolute sizing. There are no estimated minors, business entities or deduplicated household counts. Household labels are individual living contexts and may overlap.

For stratum c, `w(c) = population_control(c) / eligible_record_count(c)`.

`population(S) = Σ_records 1(record satisfies every condition in S) × w(record)`.

All joints use the complete normalized frame, never products of marginal rates. Empty joints remain zero. Effective sample size is `(Σw)² / Σw²`; the UI also exposes exact unweighted support. Main population labels are rounded to about two significant digits. Ranges are base ±30%, widened to ±50% for support <1,000 and capped at the universe. They are sensitivity bands, not statistical confidence intervals.

## Signal and discovery metrics

For every feature, `Index(f,S) = P(f | S) / P(f | universe)`. A missing denominator yields null, not a 1.0 placeholder. The underlying weighted numerator, support and both shares are inspectable. The ranking excludes defining signals. It considers over- and under-index by absolute log2(index) × sqrt(conditional share). A Strong relationship needs support ≥30, conditional share ≥1% and effect ≥1.35 (inverse effect for under-index); Medium uses ≥0.5% and ≥1.10. Definition and signal associations can still share correlated vocabulary and source templates.

Distinctiveness is the mean Bernoulli Jensen–Shannon divergence across non-defining behavior, need and channel features. Market/demographic fields are excluded. The displayed score is `min(100, round(JS × 1500))`. A type's defining features cannot inflate its divergence by construction. Pipeline and server formulas are checked for parity.

Consumption intensity is a relative textual proxy: average of `min(100, 50 × conditional_rate / universe_rate)` for paid usage/purchase, premium selection, paid subscription-platform contact, equipment purchasing, repeat choice and membership/lessons. Universe baseline is 50. This is neither spend nor heavy usage frequency. A defining signal may contribute to this proxy, unlike the intentionally non-defining divergence metric.

Industry affinity uses the same exact conditional/universe Index. Breadth counts markets with conditional share >1% and Index ≥1.15; strength sums their log2 indexes. Small/strong score multiplies `1 − min(1, population/(universe × 10%))` by `0.55 × divergence_score_unrounded + 0.45 × intensity_unrounded`. Radar's small cohort additionally requires <3% universe share. All five Radar groups rank real summaries and display their top three.

Within context C, Matrix uses `Index(A,B | C) = population(A∩B∩C) × population(C) / (population(A∩C) × population(B∩C))`. This is explicitly different from an entity profile's universe-relative signal Index. Largest uses population; most over-indexed uses Index; unexpected uses standardized excess over independent expectation; large+high-index uses size×positive excess. Promoted high-index cells require support ≥30 and Index ≥1.1. A type crossed with one of its defining signals is labeled as definition-implied and excluded from discovery highlights. These are exploratory rankings without multiple-testing correction.

## Opportunity score

Configuration is centralized in `config/scoring.json`; views never recalculate it.

| Component | Weight | Normalization |
|---|---:|---|
| Size | 18% | capped 100 × sqrt(population/(universe×15%)) |
| Distinctiveness | 15% | non-defining JS score |
| Consumption | 20% | six textual use/purchase proxies |
| Need | 15% | mean capped relative pain-signal prevalence |
| Digital reach | 10% | digital-contact prevalence ×100 |
| Industry breadth | 12% | capped breadth/8 ×100 |
| Momentum | 5% | unavailable, excluded |
| Competition | 5% | unavailable, excluded |

Available weights are renormalized; completeness reports the original available weight (90% for nonempty supported summaries). A zero textual detection rate is an observed extraction result, not missing spend or WTP. The two genuinely absent metric families remain null. An empty group has null score and 0% completeness. “Modeled” at support ≥1,000 and “Limited” below are metadata, not a claim of statistical confidence in synthetic people.

## Reproducibility and serving

All raw and record-level intermediate data remains outside deployment. `atlas_build.py` emits anonymous row-position bitmaps compressed separately with gzip, a feature/type catalog, and cohort definitions. No UUID or narrative is present in these serving files. `atlas_materialize.py` produces 1,396 common exact context cubes over 123 feature columns. SHA-256 links index, catalog and cubes; stale cubes cannot be used after an index change. Missing cubes fall back to exact word-level intersections and calibrated popcounts.

`atlas_oracle.py` independently builds calibration weights in DuckDB and evaluates row predicates for 70 contexts, including every type, cross-type overlap, structural zeros and three-way joints. It never reads serving bitmaps or cubes. Tests compare population, unweighted support and sum of squared weights, plus central metric parity and runtime routes. Floating-point comparisons use tolerance appropriate to weighted summation.

## Monetary estimates (current)

The original missing-direct-spend finding remains valid. A separate economic layer now combines the existing population calibration with reviewed external baselines: observed food/delivery spending, selected 2025 online category transaction totals, and the 2024 KOCCA age-specific paid-music transfer. It does not convert Affinity into spending or infer company revenue. The skin-care beauty activity cohort remains unpriced until an all-channel category denominator is available.

Population, relevant paid-participant population, annual spend per participant and annual spend pool are separate fields. Each estimate carries a unit, period, scope, Low/Base/High, method, confidence, population/anchor/direct-spend coverage and non-additivity metadata. Other markets stay explicitly unavailable until a compatible monetary baseline and, where necessary, a household mapping are connected. The 12/20 market coverage is not the fraction of all household spending observed.

[Full monetary formulas and limitations](MARKET_VALUE_METHODS.md) define participation, normalization, range sensitivities, age exclusions and the separate opportunity economic component. [Sanity results](MARKET_VALUE_SANITY.md) show actual population/money rank differences without claiming complete category coverage.
