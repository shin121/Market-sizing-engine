from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config"
DATA_DIR = ROOT / "data"
PROCESSED_DIR = DATA_DIR / "processed"
EXPORT_DIR = DATA_DIR / "exports"
REPORT_DIR = ROOT / "reports"
DEFAULT_DB = PROCESSED_DIR / "market_engine.duckdb"

