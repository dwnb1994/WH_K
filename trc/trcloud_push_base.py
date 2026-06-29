# -*- coding: utf-8 -*-
"""
TRCloud Push — shared helpers (session, json-wrap POST, CLI utilities)
"""

from __future__ import annotations

import base64
import json
import time
from typing import Any

import requests

from trcloud_config import BASE_URL


def b64(value: str) -> str:
    return base64.b64encode(str(value).encode()).decode()


def user_id_from_cookie(cookie: str) -> str:
    for part in cookie.split(";"):
        part = part.strip()
        if not part.startswith("u="):
            continue
        raw = part[2:]
        try:
            return base64.b64decode(raw).decode()
        except Exception:
            return raw
    return ""


def is_success(data: dict) -> bool:
    return data.get("success") in (1, "1", True)


def make_session(cookie: str, referer: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE_URL,
        "Referer": referer,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Cookie": cookie,
    })
    return s


def post_json_wrap(session: requests.Session, url: str, payload: dict, timeout: int = 90) -> dict:
    r = session.post(url, data={"json": json.dumps(payload, ensure_ascii=False)}, timeout=timeout)
    r.raise_for_status()
    return r.json()


def load_json_input(path: str, array_key: str | None = None) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if array_key and isinstance(data.get(array_key), list):
        return data[array_key]
    for key in ("documents", "items", "orders", "receives", "records"):
        if isinstance(data.get(key), list):
            return data[key]
    return [data]


def push_many(
    label: str,
    items: list[dict],
    push_one,
    dry_run: bool = False,
    delay: float = 0.3,
) -> list[dict]:
    print(f"🚀 {label}: {len(items)} เอกสาร")
    results: list[dict] = []
    for i, item in enumerate(items, 1):
        ref = item.get("po_ref") or item.get("doc_ref") or item.get("id") or f"#{i}"
        print(f"   [{i}/{len(items)}] {ref}")
        results.append(push_one(item, dry_run=dry_run))
        if not dry_run and i < len(items):
            time.sleep(delay)
    ok = sum(1 for r in results if is_success(r) or r.get("dry_run"))
    print(f"🎉 เสร็จสิ้น สำเร็จ {ok}/{len(items)}")
    return results


def auth_fields(company_id: str, passkey: str, cookie: str, user_id: str = "") -> dict:
    uid = user_id or user_id_from_cookie(cookie)
    return {
        "company_id": str(company_id),
        "passkey": passkey,
        "c": b64(company_id),
        "u": b64(uid) if uid else "",
    }


def line_total(qty: Any, price: Any) -> float:
    try:
        return float(qty or 0) * float(price or 0)
    except (TypeError, ValueError):
        return 0.0
