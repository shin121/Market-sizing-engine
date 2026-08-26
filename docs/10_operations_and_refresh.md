# Operations and refresh

## First build

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
./scripts/fetch_sources.sh
.venv/bin/market-engine full-build
.venv/bin/pytest -q
./scripts/test_postgres.sh
```

`fetch_sources.sh` is idempotent for existing non-empty files. The full build verifies checksums, calibrates adults, synthesizes minors/households, builds Phase 1 and additive Phase 2 DuckDB/Parquet, downloads or reuses the pinned multilingual semantic model, fits or reuses all 24 domain models, runs scenarios and acceptance suites, writes reports, and validates both model versions. Raw/model-cache inputs need about 2.6 GiB; derived size varies with embedding, model, and soft-membership artifacts.

## Query and serve

```bash
.venv/bin/market-engine estimate --query examples/queries/website_less_restaurant_owner_60s.json
.venv/bin/market-engine archetypes --category small_business --confidence-min 40
.venv/bin/market-engine run-scenarios
.venv/bin/market-engine domains
.venv/bin/market-engine decompose ARC-06-001
.venv/bin/market-engine validate-segmentation
.venv/bin/uvicorn market_engine.api.app:app --host 127.0.0.1 --port 8000
```

For a refresh, add a new immutable release rather than overwriting history, record URL/period/universe/license/checksum/evidence locator, update controls, bump data/model versions when semantics change, rebuild, and review reconciliation, calibration-aggregation, weight, gap, and—when independently reserved observations exist—genuine holdout reports. Promote only after tests pass. Never rename a same-input aggregation diagnostic as holdout evidence. Credentials, paid data, and legal approvals are external blockers; failed public downloads remain registered gaps.
