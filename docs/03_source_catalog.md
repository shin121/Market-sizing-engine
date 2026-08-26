# Source catalog

| Release | Publisher | Unit/universe | Role | Local verification |
|---|---|---|---|---|
| REL-KOSTAT-CENSUS-2024 | 국가데이터처 | persons and households, Census universe | population, age/sex, household controls | PDF SHA-256 |
| REL-MOIS-AGE-2024-12 | 행정안전부 | registered persons, foreigners excluded | exact ages 0–18 and adult 19+ derived total | HTML SHA-256 |
| REL-KOSTAT-EST-2024-P | 국가데이터처 | establishments | establishment totals and industry I | PDF SHA-256 |
| REL-MSS-SB-2023 | 중소벤처기업부·소상공인시장진흥공단 | small-business enterprises | I56 denominator, owner 60+, digital activity | PDF SHA-256 |
| REL-KOSTAT-REA-2024 | 국가데이터처 | employed persons age 50+ | 60–69 share proxy among non-wage workers | PDF SHA-256 |
| REL-NVIDIA-NPK-1.0 | NVIDIA | synthetic person records age 19+ | structured synthetic frame and representatives | README plus nine shard SHA-256 values |
| REL-KOSTAT-BD-2024-P | 국가데이터처 | active enterprises | all-enterprise total | PDF SHA-256 |

Machine-readable catalog: `config/sources.yml`; shard manifest: `config/nemotron_manifest.yml`; exported catalog: `data/exports/source_catalog.csv`; variable/control evidence locators: `config/control_totals.yml`.

The sources use different reference periods and universes. In particular, Census includes a broader resident universe than resident registration, and enterprises are not establishments. The engine does not merge these totals. Five-year history was not ingested because this version prioritizes the current cross-sectional vertical slice; it is an explicit refresh backlog item rather than an invented time series.
