# Phase 2R-A data dictionary

## Production tables

| Table | Grain | Important fields |
|---|---|---|
| `production.universe` | one canonical denominator universe | ID/code, Korean/English name, entity unit, geography/period, denominator definition, source release, status, version |
| `production.universe_dimension` | one dimension per universe | dimension code/name, data type, allowed values, coverage status, calibration role, source, order |
| `production.source_document` | one registered document version | publisher/title/URLs, dates, universe/sample/geography, local URI/checksum, license, material kind |
| `production.citation` | one used claim/locator | document, locator, claim, used value/unit, extraction method, reviewer status |
| `production.universe_observation` | one count/share/rate/index observation | dimension values, denominator, Low/Base/High, unit, geography/period/year, source/citation, directness, grade, method/formula, confidence, assumptions/validation |
| `production.domain_universe_mapping` | one active primary mapping per domain | primary/secondary universe, baseline observation, names/descriptions, units, inclusion/exclusion/overlap, interval, year, grade/confidence, source, method/formula, validation variables |
| `production.display_label` | one localized object label | object type/ID, code, Korean/English display names, Korean description/status label, version |
| `production.saved_segment` | one production-only saved segment | title/description, entity unit, query JSON, status, version |
| `production.data_quality_issue` | one issue per object/code | severity/status, description, remediation, source release |

## Enumerations

- Entity unit: `person`, `child_person`, `household`, `establishment`, `enterprise`.
- Dimension coverage: `observed`, `partially_observed`, `schema_ready`, `proxy_only`.
- Directness: `direct`, `derived`, `survey_applied`, `proxy`, `bounded_inference`.
- Estimate grade: `A`, `B`, `C`, `D`, `E`.
- Observation value type: `count`, `share`, `rate`, `index`.
- Universe/mapping status: `draft`, `active`, `superseded`.

## Read views

| View | Contract |
|---|---|
| `production.v_domain_summary` | 24 domain baselines with display names, units, intervals, year, source, method, grade/confidence, inclusion/exclusion/overlap |
| `production.v_axis_summary` | localized domain axes |
| `production.v_subtype_summary` | localized primary subtype metadata |
| `production.v_archetype_summary` | localized archetype metadata |
| `production.v_estimate_summary` | named domain-universe estimate cards/details |
| `production.v_source_summary` | only releases used by production observations/mappings |
| `production.v_saved_segment` | only production saved segments |
| `production.v_data_quality_status` | active/accepted/resolved quality issues and remediation |

## Display contract

Codes are stable machine identifiers. `display_name_ko`, `display_name_en`, `description_ko`, and `status_label_ko` are presentation fields. Internal codes such as `complete_with_evidence_constraints` are localized before display.

Full row-level coverage is exported in `reports/phase2r_a_domain_universe_mapping.json` and `reports/phase2r_a_baseline_coverage.json`.
