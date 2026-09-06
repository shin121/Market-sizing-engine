# Market Value baselines — reviewed release note

Updated 2026-09-07. This note records the external category anchors used by the
central research Market Value engine. It does not claim a CDD market size and it
does not represent TAM, SAM, SOM or capturable revenue.

## Beauty answer

The skin/hair/nail care cohort is an activity population (about 16.60m adults in
the current model), not a cosmetics-user population. It has no category-matched
spend anchor and therefore remains `missing_calibration_anchor`. The separate
online-cosmetics cohort is about 12.99m adults. Applying the 2025 national online
cosmetics transaction total of KRW 13.8153tn gives approximately KRW 1.06m per
online buyer per year. The two cohorts are not added: one describes care activity
and the other online cosmetics purchases, and their overlap is not observed.

The Ministry of Food and Drug Safety also reports a **2024 cosmetics domestic
market benchmark of KRW 5.46tn** (production − exports + imports). This is an
industry value at the production/import/export scope, not a count of users or a
retail spend pool, so it is recorded separately and is not used to price the
skin-care cohort or added to the online transaction total.

## Anchors

| Market / cohort | Published category baseline | Buying unit | Method | Scope |
| --- | ---: | --- | --- | --- |
| Beauty / online cosmetics buyers | KRW 13.8153tn (2025) | person | `calibrated_baseline` | online cosmetics only |
| Beauty / cosmetics industry benchmark | KRW 5.46tn (2024) | industry value | benchmark only | MFDS production − exports + imports; not a user denominator |
| Commerce / online goods and services | KRW 260.4465tn (2025) | person | `calibrated_baseline` | selected published online components |
| Travel / domestic travel cohort | KRW 33.9528tn (2025) | person | `calibrated_baseline` | online travel and transport |
| Fitness / fitness and leisure cohort | KRW 5.4403tn (2025) | person | `calibrated_baseline` | online sports and leisure goods |
| Education | KRW 4.6939tn (2025) | person | `calibrated_baseline` | online books and stationery; education services excluded |
| Pet households | KRW 2.9547tn (2025) | household | `calibrated_baseline` | online pet supplies; veterinary and offline spend excluded |
| Family with children | KRW 5.4515tn (2025) | household | `calibrated_baseline` | online children's goods |
| Mobility | KRW 7.5751tn (2025) | person | `calibrated_baseline` | online automobile and automobile supplies |
| Community / culture-leisure cohort | KRW 3.2966tn (2025) | person | `calibrated_baseline` | online culture and leisure services; not all meetings |
| Music / paid listening transfer | KOCCA 2024 age-specific paid-listener ratios and monthly payment bins | person | `calibrated_baseline` | 20–69 digital music listening and paid-use proxy; not all music or live performance |

The category source is the National Data Office annual online-shopping release,
2025-01–2025-12, published 2026-02-02. The source URL, PDF locator and SHA-256
are recorded in `config/external-spend.json`.

The music adapter applies the published paid-user/listener ratio and payment-bin
midpoints by age to the externally estimated listening cohort. The current listen
branch yields about 11.70m relevant paid participants and roughly KRW 91.7k per
paid participant per year; lower video/radio intersections inherit the age transfer
and remain clearly labeled as modeled, rather than direct payment observations.

## Allocation and uncertainty

For a profile whose unit and factor match an anchor, the engine allocates the
published national category total by the profile's externally estimated
population share. The same central object returns `annualValue`, `low`, `base`,
`high`, `annualSpendPerUnit`, `method`, `confidence`, `completeness`, scope,
source basis and assumptions. Full national anchor profiles preserve the
published total; narrower profiles use the configured allocation sensitivity
(0.5× for Low and 1.7× for High, capped at the national pool).

This is a category allocation proxy because item-level respondent spend,
frequency × ticket cross-tabs, offline spend and purchase-owner mapping are not
available for these cohorts. Mixed union roots stay unpriced, and overlapping
archetypes are marked non-additive. A profile's spend pool must never be summed
across overlapping types or presented as company revenue.

## Open evidence gaps

- All-channel cosmetics penetration and offline cosmetics spend are still
  unobserved; the skin activity cohort cannot be priced from the online anchor.
- Home/interior activity (`F54`) is not a furniture-purchaser denominator. The
  national furniture/living transaction total is therefore kept as an open anchor
  until a matching buyer or household mapping is available.
- The MFDS industry benchmark is available as a separate scope, but it cannot be
  converted into people, household spend or an all-channel user count without a
  retail/consumer denominator bridge.
- Category-specific ticket size, purchase frequency and willingness to pay are
  needed to move profiles from a low-confidence allocation to direct or weighted
  spend.
- Growth, competition, alternatives and reachability still require dedicated
  external sources or product research.
