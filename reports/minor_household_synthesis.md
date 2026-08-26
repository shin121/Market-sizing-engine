# Minor population and household synthesis

Generated: 2026-08-24

## Reconciliation

- Official age 0–18 residents: 7,324,873; weighted synthetic total: 7,324,873; error: 0.000000%.
- Official households with children age ≤18: 4,517,000; weighted sample total: 4,517,000; error: 0.000000%.
- Exact-age cells: 19; synthetic minor links: 73,249; child-household samples: 45,170; orphan links: 0.

## Method and safety

The minor frame uses direct age-specific 2024-12 resident-registration controls. It is a 1:100 weighted synthetic sample linked to a separately controlled 2024 Census child-household frame. Cross-source universe/date differences are preserved.
Household type, region cluster, dual-income marker, guardian keys, and within-household sibling assignment are synthetic constructs, not observed joints. They must not support claims about real families. There are no names, addresses, contact details, device identifiers, or real child identities.
School stage is age-derived and therefore not enrollment status. Derived person, child_person, and household estimates with weighted Base below 10 are suppressed in the Python estimator and in workspace-owned web query snapshots. Official direct controls remain immutable; an exact web reuse is wrapped in a separate redacted query snapshot. Business units and the general shared-baseline read model are outside this targeted release wrapper, so this is not a claim of universal disclosure control. The published national age cells have no below-10 cell.

## Known gaps

- Official child-count × household-type × guardian-structure joint distribution is not ingested.
- Dual-income and geography values in the synthetic link file are not calibrated and are non-queryable for factual estimates.
- Resident-registration minors exclude foreigners, while Census household controls use a different universe.
