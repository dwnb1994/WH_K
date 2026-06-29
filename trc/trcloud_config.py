# -*- coding: utf-8 -*-
"""โหลดค่า TRCloud จาก .env (repo root หรือ trc/.env) — ห้าม hardcode secret ในโค้ด"""

from __future__ import annotations

import os
from pathlib import Path


def _load_dotenv() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    trc_dir = Path(__file__).resolve().parent
    for path in (repo_root / ".env", trc_dir / ".env"):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            os.environ.setdefault(key, val)


_load_dotenv()


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def require(key: str) -> str:
    val = env(key)
    if not val:
        raise ValueError(
            f"ต้องตั้งค่า {key} ใน .env (คัดลอกจาก .env.example ที่ repo root)"
        )
    return val


def env_bool(key: str, default: bool = False) -> bool:
    val = env(key).lower()
    if not val:
        return default
    return val in ("1", "true", "yes", "on")


# ── Auth (อ่านจาก .env — ตรวจตอน login) ─────────────────────
TRCLOUD_USERNAME = env("TRCLOUD_USERNAME")
TRCLOUD_PASSWORD = env("TRCLOUD_PASSWORD")
TRCLOUD_DEVICE_ID = env("TRCLOUD_DEVICE_ID")

# ── ERP connection ────────────────────────────────────────────
BASE_URL = env("TRCLOUD_ERP_URL", "https://thaidrill.trcloud.co")

# ── Company / session ─────────────────────────────────────────
COMPANY_ID = env("TRCLOUD_COMPANY_ID", "25")
PASSKEY = env("TRCLOUD_PASSKEY")
ORIGIN_PASSKEY = env("TRCLOUD_ORIGIN_PASSKEY") or PASSKEY
USE_COMPANY_SWITCH = env_bool("TRCLOUD_USE_COMPANY_SWITCH", False)

# ── Extractor defaults ────────────────────────────────────────
DATE_FROM = env("TRCLOUD_PO_DATE_FROM", "2026-01-01")
DATE_TO = env("TRCLOUD_PO_DATE_TO", "2026-06-30")
OUTPUT_DIR = env("TRCLOUD_OUTPUT_DIR", os.path.join(os.path.expanduser("~"), "TRCloud_Export"))
