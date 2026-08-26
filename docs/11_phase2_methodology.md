# Phase 2 domain and subtype methodology

Phase 2 is additive to the Phase 1 South Korea market-sizing engine. It does not rename or overwrite the 1,440 Phase 1 archetypes, controls, estimates, source releases, or raw inputs. `market_engine_phase2.duckdb` starts as a byte copy of the Phase 1 DuckDB and adds the Phase 2 analytical tables; PostgreSQL uses `002_phase2_domains_subtypes.sql` after unchanged migration `001_core.sql`.

## Three-level hierarchy

1. `market_segment`: a Phase 1 parent or query-defined parent with an explicit person, child, household, establishment, or enterprise unit.
2. `observable_subsegment`: one of eight reusable behavior patterns per domain. These are query templates, not population estimates.
3. `motivational_subtype`: a post-fit interpretation of an actual domain cluster. Primary membership is soft and mutually exhaustive within each fitted domain model; motive/barrier tags remain overlapping and non-additive.

For a parent `P` and subtype `k`, the intended quantity is:

`N(P,k) = Σ_i w_i × P(P | x_i) × P(k | P,x_i)`

For the 120 selected Phase 1 parents, the current implementation uses a wide exploratory parent estimate and a normalized, parent-modified domain soft prevalence. The ten required semantic parent cases are also materialized as separate query-defined universes: case 1 links to `ARC-06-001`; cases 2–10 use an explicit E-grade Low/Base/High scenario over an official unit-specific control and condition cluster shares on a stored domain-axis score. Base subtype shares sum to one; the final Base count receives only a floating-point reconciliation adjustment. Low and High combine the parent interval, weighted effective-sample uncertainty, and empirical stability margins.

## Domain registry

The 24 active domains cover music/audio, video/OTT, games/e-sports, reading/webtoon, culture/events, grocery/home meals, dining/delivery/cafes, fashion/resale, beauty/personal care, travel/hospitality, sports/outdoor, hobbies/creation, pets, housing/home services, mobility/automotive, education/learning, parenting/childcare, health/wellness/care, finance/insurance, senior/retirement/care, digital devices/AI, social/creator, career/professional, and small-business digital operations.

Every domain has all 16 axis decisions, exactly 20 queryable features, 10 behavior templates, eight overlapping motive/barrier tags, eight reusable observable archetypes, at least five eligible parent allocations, source mappings, an entity unit, a coverage grade, and a domain acceptance result. Axes are object, format, occasion, location, frequency/intensity, discovery, acquisition/access, consumption mode, device/channel/platform, payment/monetization, decision unit, engagement/participation, motivation/job, barrier/risk/trust, loyalty/switching, and spending/value.

## Nemotron sampling and features

The model joins the nine pinned raw Nemotron shards to the officially calibrated adult feature mart by synthetic ID. Records without a calibration weight are excluded. Each domain draws a deterministic, weighted, keyword-relevant sample stratified by age band, sex, and province. Minors are not assigned adult Nemotron motives.

Narrative clauses are retained only when they contain domain vocabulary. The fitted matrix combines:

- revision-pinned `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` at commit `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384 dimensions, mean pooling, L2 normalized, Apache-2.0, Korean included in the model card);
- Korean character `char_wb` TF-IDF with 2–5 character n-grams;
- one-hot age band, sex, province, education, occupation, family type, and housing type;
- 64 lexical scores covering four values for each of the 16 domain axes;
- the domain-relevance indicator.

Truncated SVD reduces the joint matrix to 48 components. Each domain embedding cache is content-addressed by model ID, revision, synthetic ID, and retained clause text; its path and SHA-256 are stored with the model. Character n-grams remain useful for contrast-term explanations, while the pinned multilingual sentence model supplies the semantic representation.

## Model selection and interpretation

Each domain compares `k ∈ {3,4,5,6}` for MiniBatch K-Means and diagonal Gaussian mixtures across seeds `20260825`, `20260826`, and `20260827`. Selection combines silhouette, minimum weighted support, seed-pair adjusted Rand index, and two bootstrap refits. Every selected cluster stores weighted prevalence, Low/Base/High, hard and soft support, effective sample size, entropy, stability, five synthetic representative medoids when support allows, artifact paths, and SHA-256 checksums.

Labels are created only after fitting from contrast terms and the curated motivation axis. Observed evidence, inferred profile, and creative hypotheses are separate fields. Low-stability models are retained only with correspondingly low confidence and validation plans; no precision is upgraded by wording.

## Official priors and synthetic evidence

Official controls establish population/household/business denominators. The 2024 KOCCA music survey supplies a national 3,500-person music-use prior and behavior validation points. Nemotron supplies only synthetic structure and narrative hypotheses. Except for the original restaurant vertical slice, most Phase 2 parent counts are explicitly `exploratory_estimate` with E-grade population confidence and wide intervals until an observed joint distribution is available.

Cross-domain associations use the same weighted synthetic adult entity and never multiply marginal rates. Pairwise registry records store same-unit support and lift; incompatible generic pairs store a `not_estimable_unit_guard` record with null counts. The ten versioned cross-domain acceptance cases may request a household or enterprise output only with a documented adult decision-maker/owner-operator proxy, an official output-unit control, and an explicit Low/Base/High semantic sensitivity overlay. This is E-grade scenario sizing, not a one-person-to-one-household/enterprise conversion or an official joint estimate.
