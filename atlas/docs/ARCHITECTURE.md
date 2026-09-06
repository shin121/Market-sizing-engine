# Atlas architecture

```text
Immutable Nemotron Parquet (outside project)
  → Audit / semantic field review
  → config/atlas-features.json + scoped normalization
  → weighted commercial pair discovery + heldout / quality / overlap filters
  → overlapping 0/1 memberships + 16-cell population calibration
  → server/data/atlas-{catalog,index,cubes}.json
  → server/atlas/{source,population,metrics,engine}.ts
  → /atlas/[[...path]] server route
  → generic analytical dashboard modules
```

The original exclusive-cluster implementation, its large detail drawer, active routes and redundant indexes were removed. Git history retains the earlier implementation. Existing reference projects were inspected read-only for depth and provenance semantics; their UI, handcrafted memberships and old domain matrices are not imported.

## Central objects

`lib/atlas.ts` defines Market, Archetype, Signal, Segment, Estimate, DiscoveryMetrics, Profile and AtlasContext. Types use commercial mechanisms. Markets use interests relevant to an industry. Signals represent textual behavior, needs or channels. A segment is a canonical sorted conjunction of known conditions.

The central population module decodes compressed anonymous bitmaps lazily. Common feature counts come from fingerprint-checked cubes; arbitrary intersections use exact bitset AND and stratum-weighted population counts. Bounded caches retain 32 masks, 96 feature-stat contexts, 4,096 count results, 256 summaries and 40 profiles. Browser payloads contain only summaries and aggregate statistics.

The metric module alone computes divergence, intensity, industry breadth and opportunity. The engine assembles ranked signals, demographic distributions, parent differences, pain cohorts, micro patterns, related opportunities, search and Matrix data. Different views use identical counts and context. Algorithms run in the pipeline, never in browser rendering or per-request clustering.

## Canonical navigation

| Route | Meaning |
|---|---|
| `/atlas` | Global Atlas, people or market Lens |
| `/atlas/archetypes/:id` | Full commercial-type dashboard |
| `/atlas/markets/:id` | Full industry dashboard |
| `/atlas/signals/:id` | Behavior, need, channel, interest or demographic dashboard |
| `/atlas/segments/:id~id…` | Exact conjunction dashboard |
| `/atlas/relationship` | Relationships within URL context |
| `/atlas/matrix` | Two additional axes within URL context |
| `/atlas/opportunity` | Context-highlighted opportunity comparison |

`q` contains additional conditions, `row/col` the Matrix axes, `focus` the chosen relationship node or requested Matrix column, `lens` people/markets, `all=1` full signals, `compare` up to three pipe-separated condition sets, `tab=data` aggregate detail and `trail` recent navigation breadcrumbs. Public selections permit eight conditions. Internal analytics may intersect additional candidate features without silently changing the selected population.

An entity-name link opens that entity's complete population and carries navigation breadcrumbs. A **+** explicitly appends the entity as a filter and opens a joint segment. This distinction prevents visiting a market from silently retaining a prior type as a hidden filter. Matrix cell navigation appends both axes. Back, Forward, reload and comparison states use the browser URL, not isolated per-view filter stores.

## Reusable UI

`components/atlas/workbench.tsx` provides the navy navigation, global search, breadcrumbs, explicit condition chips and compact estimates. `entity.tsx` composes shared demographic, signals, industry, need, purchase, trust, channel, parent-difference, opportunity, micro-pattern and basis modules. Market mode places consumer types and pain signals in the first analytical row, then displays smaller cohorts and submarkets. Archetype, segment and signal modes reuse the same metrics and analytical components.

`overview.tsx` provides the map, five Radar groups, population distribution, industry ranking and adjacent candidates. `analysis-views.tsx` provides a relationship graph with in-page selected-node analysis, context-preserving Matrix and URL-persistent Opportunity comparison. The graph's links mean co-occurrence with the selected group, not a conservation flow or causal edge.

`Dataset` exposes every feature and demographic/related-type aggregate, including population, support, selected share, universe share, Index and definition flags. It has no raw rows, UUIDs, narratives, time-series placeholders or fabricated income. The application does not include chat, saved-candidate/research workflow, simulation, admin or persona illustrations.

## Runtime and quality

Vinext/React builds a Cloudflare Worker plus browser assets through the existing Sites project. Gzip-compressed postings reduce the source index from about 35 MB to about 12 MB; only the server imports it. Component props are explicit small structures, effects cancel pending search requests, list keys are stable, and link prefetch is disabled to avoid eager enumeration of the exploration graph. Native links/buttons and shadcn input/tabs/select provide keyboard interaction.

The verification layers are lexical regressions, independent SQL oracle, domain tests, compilation/lint, browser journey and responsive screenshots, browser aggregate boundary, and built-Worker/production smoke. The Sites audience remains owner-only.

## Market Value layer (v0.4)

```text
Nemotron → Population Engine → Spend Signal Engine
  → Market Value Engine → Segment / Opportunity Engine
  → Analysis Service → shared Money UI
```

`server/atlas/spend-methods.ts` provides six amount calculation paths with period, range and unit guards. `server/atlas/market-value.ts` supplies the legacy music adapter and `server/atlas/research-market-value.ts` supplies the current food, delivery, reviewed online-category and music-payment adapters. Existing calibrated population bitmaps produce per-stratum moments; no raw Parquet is loaded for page requests. A single scoped monetary component is evaluated directly against each population, not summed across overlapping archetypes.

`lib/market-value.ts` defines the central MarketValueEstimate and KRW/unit formatters. `server/atlas/market-value-service.ts` enriches existing summaries without mutating the population summary cache, adds separate economic score inputs, monetary Radar, industry/contribution tables, Matrix values and highlights. `components/atlas/money.tsx` renders those objects. It never supplies monetary assumptions or multiplies arbitrary spend by population.

URL context adds `metric=population|index|marketValue|spendPerUnit`, `spend=covered|market_id`, `x/y=population|annualValue|spendPerUnit|opportunity|distinctiveness`. Entity, Matrix, Relationship, search, comparison and history retain these selections. A market-name navigation switches the monetary scope to that industry; an explicit **+** adds a population condition. Missing household mapping remains null with separate person category-population metadata.

Active sources are reviewed food/delivery survey anchors and selected 2025 online category totals; the 2024 KOCCA music adapter remains available to the legacy service. Method adapters for direct/weighted/frequency/consumption/heuristic inputs are tested, while unsupported category scopes stay explicit. Additional components require a reviewed overlap/additivity mapping. See [Market Value methods](MARKET_VALUE_METHODS.md), [audit](MARKET_VALUE_DATA_AUDIT.md), and [verification](MARKET_VALUE_REPORT.md).
