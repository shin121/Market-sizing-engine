#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
raw="$project_root/data/raw"
mkdir -p "$raw/nemotron"

fetch() {
  local output="$1"
  local url="$2"
  if [[ ! -s "$output" ]]; then
    curl -L --fail --retry 3 -o "$output" "$url"
  fi
}

fetch "$raw/kostat_2024_census_results.pdf" "https://kostat.go.kr/boardDownload.es?bid=203&list_no=437767&seq=3"
fetch "$raw/kostat_2024_census_of_establishments_preliminary.pdf" "https://mods.go.kr/boardDownload.es?bid=233&list_no=438719&seq=7"
fetch "$raw/mss_2023_small_business_survey.pdf" "https://mss.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_000000001008674&fileSn=1"
fetch "$raw/kostat_2024_regional_employment_50plus.pdf" "https://www.kostat.go.kr/boardDownload.es?bid=11802&list_no=437653&seq=3"
fetch "$raw/kostat_2024_business_demography.pdf" "https://kostat.go.kr/boardDownload.es?bid=11469&list_no=438913&seq=1"
fetch "$raw/nemotron_README.md" "https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea/raw/main/README.md"
fetch "$raw/nemotron_tree.json" "https://huggingface.co/api/datasets/nvidia/Nemotron-Personas-Korea/tree/main/data?recursive=true&expand=true"

if [[ ! -s "$raw/mois_age_2024_12_0_18.html" ]]; then
  curl -L --fail --retry 3 -o "$raw/mois_age_2024_12_0_18.html" \
    -d "tableChart=T&sltOrgType=1&sltOrgLvl1=A&sltOrgLvl2=A&nowYear=2024&searchYearMonth=year&searchYearStart=2024&searchMonthStart=12&searchYearEnd=2024&searchMonthEnd=12&sum=sum&gender=gender&sltOrderType=1&sltOrderValue=ASC&sltArgTypes=1&sltArgTypeA=0&sltArgTypeB=18" \
    "https://jumin.mois.go.kr/ageStatMonth.do"
fi

for year in 2020 2021 2022 2023; do
  output="$raw/mois_age_${year}_12_0_18.html"
  if [[ ! -s "$output" ]]; then
    curl -L --fail --retry 3 -o "$output" \
      -d "tableChart=T&sltOrgType=1&sltOrgLvl1=A&sltOrgLvl2=A&nowYear=${year}&searchYearMonth=year&searchYearStart=${year}&searchMonthStart=12&searchYearEnd=${year}&searchMonthEnd=12&sum=sum&gender=gender&sltOrderType=1&sltOrderValue=ASC&sltArgTypes=1&sltArgTypeA=0&sltArgTypeB=18" \
      "https://jumin.mois.go.kr/ageStatMonth.do"
  fi
done

for shard in 0 1 2 3 4 5 6 7 8; do
  file="$(printf 'train-%05d-of-00009.parquet' "$shard")"
  fetch "$raw/nemotron/$file" "https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea/resolve/main/data/$file?download=true"
done

"$project_root/.venv/bin/market-engine" verify-nemotron
echo "Source acquisition complete. Run: .venv/bin/market-engine full-build"
