# Phase 2 segmentation model cards

Generated: 2026-08-24T17:13:58.092879+00:00

All labels were assigned after clustering. Nemotron records are synthetic hypotheses, not observations of real people. Cluster input combines a revision-pinned multilingual MiniLM sentence embedding with Korean character n-grams, explicit 16-axis scores, and structured fields.

## beauty_personal_care — 뷰티·개인관리

- Algorithm / k: `gaussian_mixture` / 5
- Sample / ESS: 1,000 / 999.0
- Cluster hard-support range: 59–602
- Combined stability: 0.280
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/beauty_personal_care-eb152a7341dc09a5.npz` (`66edb6591970a232b241f904dd1a1acbccdec9dd966a9e460a437e17ccf2fc5b`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/beauty_personal_care.joblib` (`55b5f173d7038ad6321dba1836880e5a313abcf8f3fc322ae4116f66990d67e6`)
- Membership artifact: `data/processed/phase2/memberships/beauty_personal_care.parquet` (`bca8b873fa45278acdebaf1ae4590f93e1d7a9a4a6208ba4280c24fc8852fe3d`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## career_professional — 경력·전문활동

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.0
- Cluster hard-support range: 249–415
- Combined stability: 0.410
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/career_professional-84164574281cfd7d.npz` (`0981514eeee9f903d9784fa4e29321e3283635c9d00e733b5965a910d7ac1eb1`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/career_professional.joblib` (`9d54f9dac24220725ba81c81b4bb570e40fec163af80632bf09ab8fd92503dfb`)
- Membership artifact: `data/processed/phase2/memberships/career_professional.parquet` (`7bb595a973d055037e2b2ecadee54ad080957584a0b810c3dc82a4aec40fb8d9`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## culture_events — 문화예술·행사

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.0
- Cluster hard-support range: 286–359
- Combined stability: 0.501
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/culture_events-b66f3926ca3d2553.npz` (`7cc978a5a0bce00e98fd285256534ede0ace67c628a4d17c406657189fd652d3`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/culture_events.joblib` (`c2bff92ce6d026b43e16692aeb2dc139c99f4602f61738779ba92cbbb9a0f93d`)
- Membership artifact: `data/processed/phase2/memberships/culture_events.parquet` (`4307c02049804e60dc7887bc85d0a28cb509ad5ea9604270876d6269628e44e4`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## digital_devices_ai — 디지털기기·AI

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.0
- Cluster hard-support range: 195–510
- Combined stability: 0.795
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/digital_devices_ai-cba71d40212cc126.npz` (`84c761709a944120dd43ceeb1a37f732cd47f2de10c8c8bd68ca57324fc8934a`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/digital_devices_ai.joblib` (`535754da392765c35e523528c0aa470315d7c6997cc1daf98f816aaaaee4ccfb`)
- Membership artifact: `data/processed/phase2/memberships/digital_devices_ai.parquet` (`9446984dc35419f6afdae72f7b1c4318e61d5b2cd68671676fcd415e1c983e1c`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## dining_delivery_cafe — 외식·배달·카페

- Algorithm / k: `gaussian_mixture` / 5
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 89–388
- Combined stability: 0.369
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/dining_delivery_cafe-a7a64787df1e564e.npz` (`2f049626b20ad384c60ecd8e8f272db6685240c4ba8e2ad8a8e05328044f4d50`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/dining_delivery_cafe.joblib` (`9458774b48d244eb1a6a5be1c8334534746e0d73910f3e7438ee68f5d1b2910b`)
- Membership artifact: `data/processed/phase2/memberships/dining_delivery_cafe.parquet` (`547d999c375b65ea63658ac577a59a5dcdfbe2892fa67359460402d974a5f815`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## education_learning — 교육·학습

- Algorithm / k: `gaussian_mixture` / 6
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 64–349
- Combined stability: 0.428
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/education_learning-8f63379136195990.npz` (`7ea1d5ad9b9cdae1d39ce6fceb42d2f9ed31759fbf0cca4d2cd746c390c21802`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/education_learning.joblib` (`eeb230644c4c7bfd847b19562d6018b8de0ef1ee20163fb1b091eb29d3f17da8`)
- Membership artifact: `data/processed/phase2/memberships/education_learning.parquet` (`a42247d418f0dda43d1d256b6e0ada775da8a765c531424e892c99a9ee1a45bd`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## fashion_resale — 패션·리셀

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 990 / 989.0
- Cluster hard-support range: 134–642
- Combined stability: 0.376
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/fashion_resale-70d76df679ad0b9f.npz` (`cb255a56f26a98078370ad77a3d1718cf127b8783ae98fbf7cf85d09039f884f`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/fashion_resale.joblib` (`cd5d45ed8d38124de0782aae4881b037d2726797dbbbdfd94fd970a79f2c6e07`)
- Membership artifact: `data/processed/phase2/memberships/fashion_resale.parquet` (`d9bb6a287f4e17d34b75f43f15bae14efed0ded989f64ecdaaad151339710ce5`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## finance_insurance — 금융·보험

- Algorithm / k: `gaussian_mixture` / 4
- Sample / ESS: 966 / 965.0
- Cluster hard-support range: 153–488
- Combined stability: 0.471
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/finance_insurance-2f39e38296e10dbd.npz` (`4bffa8e01287745dc2b42dc338a26adbf24afc90dce358f875eb72410cb61249`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/finance_insurance.joblib` (`05d188c2cd41c03cbe16b4cbd20836fe6d96695e2fe69b39a7433496f592011f`)
- Membership artifact: `data/processed/phase2/memberships/finance_insurance.parquet` (`10337e767774fe69bde6f9b500aee3abe4e7fa5e337be84cee1ffae8bc36e32b`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## gaming_esports — 게임·e스포츠

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.0
- Cluster hard-support range: 43–605
- Combined stability: 0.594
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/gaming_esports-c6aa6245df5c4950.npz` (`7c27b38fb817111ca1f885a222de0a0bfd3edba0e2777828381642a740ee15d9`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/gaming_esports.joblib` (`2deb7052a36f59fd6f06a95c900261b3edb705ceced33120e152b0f100a0ca14`)
- Membership artifact: `data/processed/phase2/memberships/gaming_esports.parquet` (`36ee674671758ca2b9e7f3272c92b3131bc621bb2d2ef5ff0dc56269412f6348`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## grocery_home_meals — 식료품·가정식

- Algorithm / k: `gaussian_mixture` / 4
- Sample / ESS: 1,000 / 999.0
- Cluster hard-support range: 57–494
- Combined stability: 0.242
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/grocery_home_meals-ec3e134442ffbe53.npz` (`b7d297b846cfaab603e2159709017a6f19d7ea0ffeec353110f30a7b23c43329`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/grocery_home_meals.joblib` (`f01547e89df8eae2ceb615ac35d910a16dcb5e1a47b01212d1e28475fd08ed69`)
- Membership artifact: `data/processed/phase2/memberships/grocery_home_meals.parquet` (`df15a60dd90262f9de1481e28c672f533acfa5b71a782e48cda95083fe1ad66a`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## health_wellness_care — 건강·웰니스·돌봄

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 66–538
- Combined stability: 0.653
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/health_wellness_care-1dba760ea18e4451.npz` (`aa6c8a64e522caa9bf8459904651baae2d2937d68529346dd926d64ac4995777`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/health_wellness_care.joblib` (`1ca50f33d804843dec7b074c6ee046e8f1ca6a29c31bdd8d9e94d8dd82d1f2c8`)
- Membership artifact: `data/processed/phase2/memberships/health_wellness_care.parquet` (`29c90f22f6d48d37b73f3efc0dcba4b281e0bb2b4f62a5f08521d711f801d144`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## hobbies_creation — 취미·창작

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.0
- Cluster hard-support range: 60–626
- Combined stability: 0.591
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/hobbies_creation-15ed87df11524bde.npz` (`d5f6f042bcab9bdb69c447754b677f44c671a076e4cc2c8d5de066bf0699235c`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/hobbies_creation.joblib` (`59e3f6c569d7f56b6a9f49146517bd57fd68c61d6a6dd4e0fcf86c216ec93545`)
- Membership artifact: `data/processed/phase2/memberships/hobbies_creation.parquet` (`6133adc40dcb2ceaff208228556ca0c6f165141fc080476781c170ad86038118`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## housing_home_services — 주거·홈서비스

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.0
- Cluster hard-support range: 316–348
- Combined stability: 0.388
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/housing_home_services-32da0e166d4fb316.npz` (`f3b3423a904e5e3bbe1f1b388017246334a1228ed0e3bf4fc037bb147818b739`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/housing_home_services.joblib` (`490055c879265d262de6610a0fc763e50fd5a6ba74797cdf1b6eb5dea473a7f8`)
- Membership artifact: `data/processed/phase2/memberships/housing_home_services.parquet` (`fb3ea4cfcfa996116e7011d8345d76a76d82028d10bff35feec162c0de7e0698`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## mobility_automotive — 모빌리티·자동차

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 160–622
- Combined stability: 0.463
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/mobility_automotive-953f8157befd84f1.npz` (`8900f721e617359009c4048cd65609cdac2f9103fd22e7d744632f5130991323`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/mobility_automotive.joblib` (`08edd00625b91c682c5694aee5d7cb8883192da1c742133553531cf7121d1338`)
- Membership artifact: `data/processed/phase2/memberships/mobility_automotive.parquet` (`3550507e0e0da9c3618055c1875187dc73cabf21053c329294d0c9f63c79291e`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## music_audio — 음악·오디오

- Algorithm / k: `gaussian_mixture` / 4
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 49–613
- Combined stability: 0.353
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/music_audio-07b97108001f41e1.npz` (`648f8ae860e9540e7288ac9ecfb54ac9e8d919bb6087cd845f3a8badc7aad522`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/music_audio.joblib` (`dd295d862a4c9d12b8a4ce1a74ca9f354ef84984c3bb1942e3a83f6e2ac50eea`)
- Membership artifact: `data/processed/phase2/memberships/music_audio.parquet` (`1231078c0ff274278d6811198effe073eb0abb674043cf7ca3bc8b58e09ee64f`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## parenting_childcare — 양육·보육

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.0
- Cluster hard-support range: 275–416
- Combined stability: 0.364
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/parenting_childcare-9c9c9d05db3d2f75.npz` (`c274987523348091514264eaf6e038dc94096d615834703a7abc3f14fe67fa90`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/parenting_childcare.joblib` (`c9e84a32deadee264aa131fc9a44d5c2625469fe965892623436b59d92e14c19`)
- Membership artifact: `data/processed/phase2/memberships/parenting_childcare.parquet` (`27d38b074244f2e68d0025f6bbf569b2b10351b76f5ee01c325fe3e9544b4e9a`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## pets — 반려동물

- Algorithm / k: `gaussian_mixture` / 4
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 105–431
- Combined stability: 0.300
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/pets-3b28768ef6d11f1c.npz` (`0a00b71cbefd12e8c39635724e857611df212fa0dea1f099825e7d0b75e8b93b`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/pets.joblib` (`e324c0fc90db26a3f2fda23d2b026bd496e24fe97027898d9a0454bbd52b62d0`)
- Membership artifact: `data/processed/phase2/memberships/pets.parquet` (`b34ed819eff7f515684f0bbc1cc4397a30d2f23318717020c43f2602dd24270b`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## reading_webtoon — 독서·웹툰

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 239–384
- Combined stability: 0.327
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/reading_webtoon-c276d6800a55509c.npz` (`01ab7937a71e76992a8d8d840cf6b1480785f2380d8c129dff8bfe062bfd135f`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/reading_webtoon.joblib` (`a8466f06f1b929c2283559c58c26a56b9276f77a676514cfdafd8bc3f82b71c8`)
- Membership artifact: `data/processed/phase2/memberships/reading_webtoon.parquet` (`b45b34777d14e0f208eadc12a24c89b055b22c8543ad19a27ba5d844ebdde621`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## senior_retirement_care — 시니어·은퇴·돌봄

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 188–496
- Combined stability: 0.589
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/senior_retirement_care-c7fb100080618acb.npz` (`861dc7d0b85fabe02036f00e30594383a3f14c557accb6c2ec79e7917b8ba6e2`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/senior_retirement_care.joblib` (`05cc669d12ad85bdbcaeaf86f79709ee17eb99087bb890eb43171c4840db78ee`)
- Membership artifact: `data/processed/phase2/memberships/senior_retirement_care.parquet` (`1171848df6678ff94ab64acd586e44ca5a4c1424c2f6130ec6d0461870d5dfa2`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## small_business_digital — 소상공인·디지털 운영

- Algorithm / k: `gaussian_mixture` / 5
- Sample / ESS: 1,000 / 999.0
- Cluster hard-support range: 66–368
- Combined stability: 0.359
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/small_business_digital-203d8a8629a24188.npz` (`5b9ae03715023b5c9fa23ae7adb0135206a1533e590e840afd52bc33e5c86040`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/small_business_digital.joblib` (`6ca44bc59c71855681ab32c400c989ac9827decab21c69765fd336f583cb7912`)
- Membership artifact: `data/processed/phase2/memberships/small_business_digital.parquet` (`853c5859afcbc6c94fe10ccafa6a3b31a5de28d8f75645259dce33cd954622c1`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## social_creator — 소셜·크리에이터

- Algorithm / k: `gaussian_mixture` / 4
- Sample / ESS: 905 / 904.1
- Cluster hard-support range: 67–416
- Combined stability: 0.372
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/social_creator-6cd8e213d8939b90.npz` (`c99a59d312c2c3083739d8239db9cf97dd6ede7d94bc027e0a45b97a1801a219`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/social_creator.joblib` (`e714bcb354f73066682bb74ee441b514bafea2d5bfbf7d9d30ae8036ef58b645`)
- Membership artifact: `data/processed/phase2/memberships/social_creator.parquet` (`d30264de5551862a2013f4bbbb661eda4e192d70f8877492827ece835e8976ae`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## sports_outdoor — 스포츠·아웃도어

- Algorithm / k: `gaussian_mixture` / 5
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 67–417
- Combined stability: 0.302
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/sports_outdoor-a0d62a5529145e3c.npz` (`65d3b3215249822b12906c63fde493af5ebb9546bb86cde0901d26a8276ee319`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/sports_outdoor.joblib` (`4c46d4748fef8de004b065683a7fafc6025af7e5547554300e6b88e56eadb684`)
- Membership artifact: `data/processed/phase2/memberships/sports_outdoor.parquet` (`efd67ae1bfe3e01094f90f8fe2d58776cae64b3d921f80cac9a013eeadd4748d`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## travel_hospitality — 여행·숙박

- Algorithm / k: `gaussian_mixture` / 5
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 46–614
- Combined stability: 0.169
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/travel_hospitality-89721b928405b9ba.npz` (`22273cfcfa068ae6ebbc44b0bc1e6820e5911ac8401037c6f962e147ce3140fc`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/travel_hospitality.joblib` (`e60cd21128aff947b93982da81312cd9b55d11a0ee6ff545445e1cc060eb0e89`)
- Membership artifact: `data/processed/phase2/memberships/travel_hospitality.parquet` (`a622df587099d4420f9ed2b360a915da6913b73b4d23dcdec573b075f6abd497`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.

## video_ott — 영상·OTT

- Algorithm / k: `gaussian_mixture` / 3
- Sample / ESS: 1,000 / 999.1
- Cluster hard-support range: 106–517
- Combined stability: 0.693
- Semantic model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` @ `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` (384d, normalized=True)
- Embedding cache: `data/processed/phase2/embeddings/video_ott-c956e84753341786.npz` (`492c6e8b7c5e20969d1528758abcfd600bc3c396ebfeda202e69e5a472c3d581`)
- Axis features: 64; extractor: normalized lexical token match against all 16 domain axes; exploratory
- Sample strata: age_band, sex, province, domain_keyword_relevance
- Model artifact: `data/processed/phase2/models/video_ott.joblib` (`fea68cefe9d2185eea278562742691fca75e5f9e2b17743f75c1294f609af5da`)
- Membership artifact: `data/processed/phase2/memberships/video_ott.parquet` (`d36b018e2ceebafb6f77c1b80d19f53ff02c76319800dc4d47be245d3f40afec`)
- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.
