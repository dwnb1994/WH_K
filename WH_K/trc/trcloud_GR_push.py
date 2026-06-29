# -*- coding: utf-8 -*-
"""
TRCloud GR Pusher — สร้าง/บันทึกใบรับสินค้า (Goods Receive)

Endpoint:
  POST /application/ics/api/engine-receive/edit_receive.php
  Body: json={...}  (json-wrap, id ว่าง = สร้างใหม่)

วิธีรัน:
  py trcloud_GR_push.py --input templates/gr_push.json --dry-run
  py trcloud_GR_push.py --input my_gr.json
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from typing import Any

from trcloud_auth import get_cookie, get_cookie_for_company
from trcloud_config import COMPANY_ID, ORIGIN_PASSKEY, PASSKEY, USE_COMPANY_SWITCH
from trcloud_push_base import (
    BASE_URL,
    auth_fields,
    is_success,
    line_total,
    load_json_input,
    make_session,
    post_json_wrap,
    push_many,
)

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

API_SAVE = f"{BASE_URL}/application/ics/api/engine-receive/edit_receive.php"
REFERER = f"{BASE_URL}/application/ics/receive.php"


def _cookie() -> str:
    if USE_COMPANY_SWITCH:
        return get_cookie_for_company(COMPANY_ID, origin_passkey=ORIGIN_PASSKEY)
    return get_cookie()


def build_list_lines(doc: dict) -> list[dict]:
    default_wh = doc.get("warehouse") or ""
    out: list[dict] = []
    for line in doc.get("lines") or []:
        qty = line.get("quantity") or line.get("qty") or 0
        price = line.get("price") or 0
        row = {
            "product_id": line.get("product_id") or "",
            "product": line.get("product") or line.get("product_name") or "",
            "quantity": qty,
            "price": price,
            "total": line.get("total") if line.get("total") is not None else line_total(qty, price),
            "warehouse": line.get("warehouse") or default_wh,
            "remark": line.get("remark") or "",
            "serial": line.get("serial") or "",
            "acc_code": line.get("acc_code") or "",
        }
        if line.get("mr_item_id"):
            row["mr_item_id"] = line.get("mr_item_id")
        out.append(row)
    if not out:
        raise ValueError("ต้องมี lines[] อย่างน้อย 1 รายการ")
    return out


class TRCloudGRPusher:
    def __init__(self, company_id: str, passkey: str, cookie: str, user_id: str = ""):
        self.company_id = company_id
        self.passkey = passkey
        self.cookie = cookie
        self.user_id = user_id

    def build_payload(self, doc: dict) -> dict:
        today = str(doc.get("date") or date.today().isoformat())
        list_lines = build_list_lines(doc)
        receive_id = str(doc.get("receive_id") or doc.get("id") or "")

        payload: dict[str, Any] = {
            **auth_fields(self.company_id, self.passkey, self.cookie, self.user_id),
            "type": doc.get("type") or "",
            "id": receive_id,
            "company_format": doc.get("company_format") or "",
            "document_number": doc.get("document_number") or "",
            "issue_date": doc.get("issue_date") or today,
            "title": doc.get("title") or "GR",
            "date": today,
            "status": doc.get("status") or "draft",
            "create_by": doc.get("create_by") or "goods_receive",
            "request_by": doc.get("request_by") or "",
            "purpose": doc.get("purpose") or "",
            "description": doc.get("description") or "",
            "stage": str(doc.get("stage") or "1"),
            "name": doc.get("name") or "",
            "telephone": doc.get("telephone") or "",
            "contact_id": str(doc.get("contact_id") or ""),
            "department": doc.get("department") or "",
            "project": doc.get("project") or "",
            "warehouse": doc.get("warehouse") or "",
            "url": doc.get("url") or "",
            "other": doc.get("other") if isinstance(doc.get("other"), str) else "{}",
            "dropbox": doc.get("dropbox") or [],
            "detail": doc.get("detail") or [],
            "list": list_lines,
        }
        return payload

    def push_one(self, doc: dict, dry_run: bool = False) -> dict:
        payload = self.build_payload(doc)
        label = payload.get("document_number") or payload.get("id") or "new GR"
        session = make_session(self.cookie, REFERER)

        if dry_run:
            print(f"🔍 [dry-run] GR {label}: {len(payload['list'])} รายการ")
            return {"success": True, "dry_run": True, "label": label, "payload": payload}

        data = post_json_wrap(session, API_SAVE, payload)
        if is_success(data):
            print(f"✅ บันทึก GR สำเร็จ: {label} — {data.get('message', '')}")
        else:
            print(f"❌ GR ไม่สำเร็จ: {label} — {data.get('message', data)}")
        return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TRCloud GR (ใบรับสินค้า) pusher")
    parser.add_argument("--company-id", default=COMPANY_ID)
    parser.add_argument("--passkey", default=PASSKEY)
    parser.add_argument("--cookie", default=None)
    parser.add_argument("--user-id", default="")
    parser.add_argument("--input", required=True, help="JSON ใบรับ (ดู templates/gr_push.json)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()

    docs = load_json_input(args.input)
    cookie = args.cookie or _cookie()
    pusher = TRCloudGRPusher(args.company_id, args.passkey, cookie, user_id=args.user_id)
    push_many("GR push", docs, pusher.push_one, dry_run=args.dry_run, delay=args.delay)
