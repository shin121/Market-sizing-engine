from __future__ import annotations

import csv
import re
from typing import Any

import duckdb

from .io import load_json_yaml, sha256_file
from .paths import CONFIG_DIR, EXPORT_DIR, PROCESSED_DIR, REPORT_DIR, ROOT


def build_source_history() -> dict[str, Any]:
    config = load_json_yaml(CONFIG_DIR / "source_history.yml")
    rows = []
    for release in config["releases"]:
        path = ROOT / release["file"]
        actual = sha256_file(path)
        if actual != release["sha256"]:
            raise RuntimeError(f"history checksum failure: {path}")
        text = path.read_text(encoding="utf-8", errors="ignore")
        national = text[text.index("전국</td>"):]
        values = [int(value.replace(",", "")) for value in re.findall(fr'title="{release["year"]}년 12월 / 계"[^>]*>([0-9,]+)</td>', national)]
        if len(values) < 21 or sum(values[2:21]) != values[1]:
            raise RuntimeError(f"unexpected official history table: {path}")
        rows.append({"year":release["year"],"period":release["period"],"resident_total":values[0],"age_0_18":values[1],"adult_19_plus":values[0]-values[1],"sha256":actual,"source_id":config["source_id"]})
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = EXPORT_DIR / "population_history_2020_2024.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader(); writer.writerows(rows)
    con = duckdb.connect()
    con.execute("CREATE TABLE history(year INTEGER, period VARCHAR, resident_total BIGINT, age_0_18 BIGINT, adult_19_plus BIGINT, sha256 VARCHAR, source_id VARCHAR)")
    con.executemany("INSERT INTO history VALUES (?, ?, ?, ?, ?, ?, ?)", [tuple(row.values()) for row in rows])
    parquet = PROCESSED_DIR / "population_history_2020_2024.parquet"
    con.execute(f"COPY history TO '{parquet.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    con.close()
    report = REPORT_DIR / "source_history.md"
    lines = ["# Five-year source history", "", "Official MOIS resident-registration population, December of each year.", "", "| Year | Resident total | Age 0–18 | Adult 19+ |", "|---:|---:|---:|---:|"]
    lines.extend(f"| {row['year']} | {row['resident_total']:,} | {row['age_0_18']:,} | {row['adult_19_plus']:,} |" for row in rows)
    lines.extend(["", "Universe excludes foreigners and must not be combined with Census totals. Each raw HTML release is checksum-pinned.", ""])
    report.write_text("\n".join(lines), encoding="utf-8")
    return {"years":len(rows),"rows":rows,"outputs":[str(csv_path.relative_to(ROOT)),str(parquet.relative_to(ROOT)),str(report.relative_to(ROOT))]}
