# -*- coding: utf-8 -*-
"""Environment helpers for TRCloud scripts.

Values are loaded from environment first, then optional local .env files.
Never commit real .env files.
"""

from __future__ import annotations

import os
from pathlib import Path


def load_dotenv() -> None:
    root = Path(__file__).resolve().parent.parent
    candidates = [
        root / ".env",
        root / "Python_K" / ".env",
        root / "WH_K" / ".env",
        root / "SR_APP" / "WH_K" / "warehouse-app" / ".env",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def env(key: str, default: str = "") -> str:
    load_dotenv()
    return os.environ.get(key, default).strip()


def require_env(key: str) -> str:
    value = env(key)
    if not value:
        raise ValueError(f"Missing required environment variable: {key}")
    return value


def env_bool(key: str, default: bool = False) -> bool:
    value = env(key).lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}
