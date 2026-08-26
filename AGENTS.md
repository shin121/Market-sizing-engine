# Repository rules

- Preserve source provenance: every published estimate must link to a source release, reference period, denominator, method, confidence assessment, and validation gap review.
- Keep entity units explicit: `person`, `child_person`, `household`, `establishment`, and `enterprise` are never interchangeable without a documented conversion.
- Treat synthetic narrative attributes as hypotheses, never as facts about real people. Do not store real names, contacts, addresses, account identifiers, or minor identities.
- Store large immutable inputs and feature marts under `data/` as Parquet; keep metadata, rules, lineage, and aggregates in PostgreSQL-compatible tables.
- Never replace missing evidence with zero. Use `not_estimable` and record what evidence would make it estimable.
- Keep random seeds fixed and version all model inputs. Update `PLANS.md` after each phase checkpoint.
- Run `python -m pytest` and `python -m market_engine.cli.main validate` before declaring a checkpoint complete.
- Detailed methodology and operating constraints live under `docs/`.
