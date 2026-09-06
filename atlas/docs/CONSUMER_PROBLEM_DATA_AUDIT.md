# Consumer problem evidence — 2026-09-06

This adds measured, industry-specific problem experiences to the external demand
model. It does not establish total product usage, willingness to pay, unmet-need
severity, growth, or capturable revenue.

## Source and reproducibility

- Korea Consumer Agency, [2025 한국의 소비생활지표](https://www.kca.go.kr/smartconsumer/sub.do?menukey=7301&mode=view&no=1004455437), published on the source page 2026-04-22.
- Fieldwork 2025-05-16 to 2025-06-13; preceding-one-year experience questions.
- 10,000 respondents, age 19+, aware of household finances and participating in
  their own or family consumption decisions. The instrument explicitly includes
  family consumption. Respondents are neither deduplicated households nor always
  direct purchasers/users of the product.
- Report p.57 explicitly says no population-estimation weights were applied.
  Atlas transfers age-specific rates to its independent official age-20+ frame;
  it does not present the result as an official population estimate.
- The 1,108-page PDF includes Appendix 3 at PDF page 495 (appendix printed page 1).
- SHA-256: `7e070699b3d0bcdb66ee26e9edd3842d1fb3c366bf65124b54106e212ed8b06f`.
- `scripts/extract-consumer-research.py` verifies the hash and extracts only numeric
  observations to `config/research/consumer-observations.json`. The PDF and raw
  survey records are not shipped. Nineteen tables / thirty-eight PDF pages are retained.
- PDF pages 505 and 601 were rendered and visually checked. Last-column cells
  sometimes lack a table border; the extractor recovers printed characters by
  their centers, including multirow headers. Unrecoverable or published `-` stays
  null. Published `0.0` remains a rounded observation.

## Denominators

| Field family | Meaning / unit | Denominator | Sizing use |
| --- | --- | --- | --- |
| `problem` | Any of 12 problems in a specified product, preceding year, % | All 10,000 respondents; age/sex/region strata have their own n | Product-problem related adult population; never total product users |
| `quality` … `delivery` | A specified problem in a specified product, % | Any-product problem experiencers, n=5,035; not product users | First undo conditioning using that stratum's problem n / all n |
| `online_channels` | PC/mobile/SNS/C2C use %, monthly mean frequency, problem % | Use: all respondents. Frequency/problems: users of that channel | Channel parent population; frequency remains a descriptive purchase-behavior signal |
| `offline_channels` | Department store/mart/convenience store/traditional market use, frequency, problems | Same channel-specific distinction | Extracted; retained for a later offline journey |
| `priority_pc` … `priority_c2c` | Twelve issue types ranked as the most serious problem for that channel | Users of the channel who experienced a problem: national n=601 PC, 1,225 mobile, 145 SNS, 266 C2C | Conditional lower problem cohorts; not all complaints and not willingness to pay |

Question 2, PDF448, defines problems across the full purchase/use/disposal process.
Specific-type tables use the 5,035-person denominator even where a table caption
says “전체”. The actual row n and source questionnaire take precedence together.

Example: beauty any-problem rate is 8.2% of 10,000. Beauty advertising problems are
6.9% of 5,035: `0.069 × 5,035 / 10,000 = 3.47415%` of all respondents. This is NOT
6.9% of beauty users or of all adults. The engine performs this correction for
each demographic stratum, then divides by the product-problem rate to create a
conditional child. The parent is multiplied only once.

## Online transaction-channel increment

The commerce journey now exposes four lower-level channel cohorts from Appendix 3,
PDF 601–602: PC internet shopping, mobile shopping, SNS-platform shopping and
person-to-person platform trading. The national observations are:

| Channel | Use in preceding year | Monthly mean frequency | Channel users reporting a problem |
| --- | ---: | ---: | ---: |
| PC | 37.4% | 3.1회 | 16.1% |
| Mobile | 67.1% | 5.1회 | 18.3% |
| SNS | 15.3% | 1.9회 | 9.5% |
| C2C | 19.2% | 1.8회 | 13.9% |

Use rates are transferred to the official 20+ person frame by age and sex. The
channel profiles are modeled intersections inside the existing online-shopping
branch; they are not added to one another and do not mean that every channel user
bought the same category. The monthly frequencies are shown as observations only:
without item-level ticket size or category spend they do not become a market value.

Each channel has three lower problem cohorts selected from the channel-priority
tables. For example, mobile quality is modeled as:

`mobile use × mobile problem experience × quality selected as most serious`.

The priority percentage is conditional on channel problem experiencers, so the
result is an estimated share of all adults after both denominators are applied.
Where a demographic priority cell is missing, the national priority is transferred
and the profile states that imputation; missing is never treated as zero. A lower
problem cohort therefore means a reported, most-serious problem within the channel,
not every user who ever encountered a quality or delivery issue. Frequency, item
mix, monetary loss, resolution and paid solution intent remain follow-up questions.

## Connected journeys and order of magnitude

These are transferred estimates, not official counts or mutually exclusive groups.

| Observed product-problem parent | Modeled adults | Industry-specific lower examples |
| --- | ---: | --- |
| Beauty products/services | 3.65m | Misleading ads 1.52m; value/price dissatisfaction 1.50m; redress 0.24m |
| Clothing/shoes/bags | 8.15m | Quality 1.97m; redress 0.84m; delivery 1.46m |
| Home repair/interior services | 2.16m | Contract failures 0.22m; comparison information 0.34m; price 0.67m |
| Appliances | 2.92m | Quality 0.25m; comparison information 0.32m; redress 0.23m |
| Sports facilities | 2.36m | Cancellation/redress 0.59m; terms 0.56m; price 0.64m |
| Travel services | 3.41m | Terms 0.60m; redress 0.49m; advertising 0.75m |
| Education services | 1.84m | Advertising 0.36m; comparison information 0.26m; redress 0.26m |
| Insurance | 4.65m | Incomplete explanation/sale 1.22m; information 0.98m; terms 0.89m |
| Financial products | 3.48m | Privacy/fraud concerns 1.00m; information 0.76m; explanation 0.72m |
| Digital health devices | 2.06m | Advertising 0.58m; information 0.32m; explanation 0.24m |

The prior care-experience cohort (16.60m) and online-cosmetics cohort (12.99m) remain
separate. Neither is total cosmetics use. These new problem cohorts do not inherit
their spend or participation rates. Financial transaction balances are not spend.

## Model, profile and UX limits

- Each age's published rate is preserved. Sex margins inform an imputed age×sex
  table; actual observed joint microdata are not claimed. Age 60+ rates transfer to
  both sixties and seventies-plus. Source “20대” includes eligible 19-year-olds.
- Base ±25% per transferred factor is a sensitivity assumption, not a survey CI.
  Child envelopes also include parent uncertainty.
- Regional shares use official regional population × regional experience rates.
  Where child rates are missing, the parent pattern is used with an explicit note.
  Any remaining region missingness uses the same cohort's nationwide rate, named
  explicitly in the profile. Age×region differences are not measured.
- Forty factors create ten parent branches / thirty lower profiles in seven markets.
  They are observed branches in their own right, not generic pains multiplied into
  unrelated activity cohorts. Market roots use overlap bounds for the union.
- Four channel factors and twelve channel-specific most-serious-problem factors are
  registered centrally and surfaced as sixteen lower commerce profiles. Their
  population unit is person and their method is `survey_transfer`.
- UI marks measured problems separately from hypothetical jobs, alternatives,
  severity and payment intent. Subtypes reach Matrix, search and comparison through
  the same central model. Definition text avoids repeating the parent paragraph.
- No new monetary anchor or score component is fabricated. Pain incidence does not
  automatically become need intensity; membership in a pain-defined cohort is not
  a 100% opportunity signal.

## Verification

The 72-test Atlas suite covers denominator correction, source nulls and last-column
recovery, all 30 child/parent and age invariants, region normalization, all ten
journey links to Matrix/comparison, and no spend borrowing. Existing food-money
rank inversion and unit guards still pass. See the running research evidence log
for browser and build results. The active goal remains in progress.
