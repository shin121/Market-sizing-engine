# Nemotron adult calibration

Generated: 2026-08-24

## Result

- Input: 1,000,000 unique synthetic records across nine checksum-verified Parquet shards.
- Controlled frame: ages 20+, weighted to the 2024 Census national age-band × sex table (44,105,000 persons).
- Pre-calibration share MAPE: 2.6641%.
- Post-calibration share MAPE on fitted cells: 0.0000% (direct cell calibration).
- Weight range: 42.451–47.144; Kish effective sample size: 988,569 (99.9% of controlled records).
- Uncontrolled age-19 records: 10,491. Their weight is NULL and they are excluded from official population estimates.

## Interpretation and limits

The NVIDIA rows are synthetic sampling frames, never official population counts. Calibration weights are only valid for national age-band × sex margins; province, household, occupation, and other joints remain synthetic and must not be described as observed Korean distributions.
Narrative persona text is deliberately excluded from the feature mart. Structured fields retain `synthetic_structured_field` provenance. Age 19 remains a registered calibration gap until a compatible official single-age control is ingested.

## Lineage

- Calibration release: `REL-KOSTAT-CENSUS-2024`; reference date: `2024-11-01`.
- Synthetic source: `REL-NVIDIA-NPK-1.0`, CC BY 4.0.
- Cell diagnostics: `data/exports/nemotron_calibration.csv`.
- Feature mart: `data/processed/nemotron_feature_mart.parquet`.
