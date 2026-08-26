# Cross-domain association report

Model version: `kr-v0.2.1`

- Pair records: 276
- Same-unit exploratory joints: 163
- Cross-unit guarded pairs: 113

No pair uses an unobserved independence product. Same-unit registry values use weighted joint support on the same synthetic entity. Mixed-unit acceptance queries require an explicit output unit, a documented adult decision-maker bridge, and an E-grade semantic sensitivity overlay; otherwise they remain guarded.

## Highest exploratory lifts with measured joint support

| Domain A | Domain B | Unit | Joint share | Lift | ESS | Method |
|---|---|---|---:|---:|---:|---|
| fashion_resale | beauty_personal_care | person | 0.0143 | 4.028 | 283.7 | weighted_same_synthetic_person_joint |
| gaming_esports | social_creator | person | 0.0077 | 2.111 | 147.9 | weighted_same_synthetic_person_joint |
| fashion_resale | social_creator | person | 0.0027 | 1.951 | 53.0 | weighted_same_synthetic_person_joint |
| gaming_esports | digital_devices_ai | person | 0.0443 | 1.499 | 871.0 | weighted_same_synthetic_person_joint |
| hobbies_creation | social_creator | person | 0.0177 | 1.478 | 346.7 | weighted_same_synthetic_person_joint |
| gaming_esports | career_professional | person | 0.0579 | 1.458 | 1121.1 | weighted_same_synthetic_person_joint |
| social_creator | career_professional | person | 0.0228 | 1.410 | 443.6 | weighted_same_synthetic_person_joint |
| gaming_esports | fashion_resale | person | 0.0048 | 1.386 | 91.9 | weighted_same_synthetic_person_joint |
| health_wellness_care | senior_retirement_care | person | 0.1137 | 1.378 | 2326.4 | weighted_same_synthetic_person_joint |
| beauty_personal_care | social_creator | person | 0.0051 | 1.351 | 98.9 | weighted_same_synthetic_person_joint |
| fashion_resale | career_professional | person | 0.0200 | 1.310 | 392.6 | weighted_same_synthetic_person_joint |
| hobbies_creation | digital_devices_ai | person | 0.1274 | 1.306 | 2564.6 | weighted_same_synthetic_person_joint |
| video_ott | social_creator | person | 0.0235 | 1.253 | 458.6 | weighted_same_synthetic_person_joint |
| fashion_resale | hobbies_creation | person | 0.0142 | 1.253 | 281.7 | weighted_same_synthetic_person_joint |
| video_ott | digital_devices_ai | person | 0.1898 | 1.245 | 3809.1 | weighted_same_synthetic_person_joint |
| digital_devices_ai | social_creator | person | 0.0149 | 1.243 | 292.7 | weighted_same_synthetic_person_joint |
| grocery_home_meals | beauty_personal_care | person | 0.0425 | 1.156 | 857.5 | weighted_same_synthetic_person_joint |
| fashion_resale | sports_outdoor | person | 0.0270 | 1.129 | 534.5 | weighted_same_synthetic_person_joint |
| beauty_personal_care | health_wellness_care | person | 0.0440 | 1.124 | 891.5 | weighted_same_synthetic_person_joint |
| housing_home_services | finance_insurance | household | 0.0105 | 1.108 | 207.8 | weighted_household_decision_maker_proxy_joint |
| video_ott | career_professional | person | 0.2250 | 1.099 | 4442.5 | weighted_same_synthetic_person_joint |
| grocery_home_meals | fashion_resale | person | 0.0150 | 1.090 | 298.8 | weighted_same_synthetic_person_joint |
| gaming_esports | sports_outdoor | person | 0.0679 | 1.090 | 1320.8 | weighted_same_synthetic_person_joint |
| culture_events | career_professional | person | 0.1117 | 1.086 | 2206.8 | weighted_same_synthetic_person_joint |
| sports_outdoor | career_professional | person | 0.3001 | 1.084 | 5933.0 | weighted_same_synthetic_person_joint |
| culture_events | sports_outdoor | person | 0.1736 | 1.077 | 3465.5 | weighted_same_synthetic_person_joint |
| video_ott | beauty_personal_care | person | 0.0511 | 1.076 | 1020.1 | weighted_same_synthetic_person_joint |
| parenting_childcare | finance_insurance | household | 0.0224 | 1.071 | 444.6 | weighted_household_decision_maker_proxy_joint |
| beauty_personal_care | hobbies_creation | person | 0.0325 | 1.071 | 651.5 | weighted_same_synthetic_person_joint |
| video_ott | gaming_esports | person | 0.0492 | 1.068 | 955.1 | weighted_same_synthetic_person_joint |

## Unit-guard rule

Person, household, establishment, and enterprise signals are never combined silently. A generic mixed-unit query returns `not_estimable`; the ten versioned acceptance cases may use an explicit adult decision-maker/owner-operator proxy, official output-unit denominator, and wide scenario overlay. They never assert one person equals one household or enterprise.
