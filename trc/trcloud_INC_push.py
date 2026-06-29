# -*- coding: utf-8 -*-
"""
TRCloud INC Pusher — รับสินค้าจาก PO (Cargo / create_cargo)

Endpoint:
  POST /application/ordermgmt_po/api/engine-cargo/create_cargo.php
  Body: json={...}  (json-wrap)

Flow TRCloud:
  po.php → รับสินค้า → new_receive.php?id=<po_id>&type=po2gr → create_cargo.php

จุดสำคัญ:
  - po_id / reference / detail[].po_item_id ผูกกับ PO ต้นทาง
  - fetch_po_head=true จะดึง header+บรรทัดจาก retrieve_po.php ก่อนส่ง

วิธีรัน:
  py trcloud_INC_push.py --input templates/inc_receive.json --dry-run
  py trcloud_INC_push.py --po-id 99800 --po-ref PO26050364 --line po_item_id=399085,qty=10
"""

from __future__ import annotations

import argparse
import json
import os
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

API_CREATE = f"{BASE_URL}/application/ordermgmt_po/api/engine-cargo/create_cargo.php"
API_PO_RETRIEVE = f"{BASE_URL}/application/expense/api/engine-po/retrieve_po.php"
API_PO_LIST = f"{BASE_URL}/application/expense/api/engine-po/po_search_keyword.php"
PO_JSON_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "apps", "api", "data", "po.json",
)


def _cookie() -> str:
    if USE_COMPANY_SWITCH:
        return get_cookie_for_company(COMPANY_ID, origin_passkey=ORIGIN_PASSKEY)
    return get_cookie()


def fetch_po_head(session, po_id: str) -> dict:
    payload = {
        "company_id": COMPANY_ID,
        "passkey": PASSKEY,
        "type": "po",
        "id": str(po_id),
    }
    data = post_json_wrap(session, API_PO_RETRIEVE, payload)
    if not is_success(data):
        raise RuntimeError(f"retrieve_po failed: {data.get('message', data)}")
    return {
        "head": data.get("head") or {},
        "detail": data.get("detail") or data.get("item") or data.get("items") or [],
    }


def post_form(session, url: str, payload: dict, timeout: int = 90) -> dict:
    r = session.post(url, data=payload, timeout=timeout)
    r.raise_for_status()
    return r.json()


def search_po_id_by_ref(session, po_ref: str, date_from: str, date_to: str) -> str:
    """
    หา po_id จากเลข PO (เช่น PO26060139) ผ่าน po_search_keyword.php
    หมายเหตุ: endpoint นี้เป็น form-urlencoded (ไม่ json-wrap)
    """
    keyword = (po_ref or "").strip()
    if not keyword:
        raise ValueError("ต้องมี po_ref เพื่อค้นหา po_id")

    payload = {
        "company_id": COMPANY_ID,
        "passkey": PASSKEY,
        "keyword": keyword,
        "start": 0,
        "filter": "",
        "from": date_from,
        "to": date_to,
        "activate_date": "off",
        "sort": "",
        "type": "project",
        "id": "",
    }
    res = post_form(session, API_PO_LIST, payload)
    if res.get("success") != 1:
        raise RuntimeError(f"po_search_keyword failed: {res.get('message', res)}")

    rows = res.get("result") or []
    # ลอง match ตรง ๆ ก่อน
    for r in rows:
        if str(r.get("company_format", "")).upper() == "PO":
            ref = f"PO{r.get('document_number', '')}"
            if ref == keyword:
                return str(r.get("po_id") or r.get("id") or "")
        if str(r.get("po_ref") or "") == keyword:
            return str(r.get("po_id") or r.get("id") or "")

    # fallback: เลข document_number (ตัด PO ออก)
    numeric = keyword.replace("PO", "").strip()
    for r in rows:
        if str(r.get("document_number") or "") == numeric:
            return str(r.get("po_id") or r.get("id") or "")

    raise RuntimeError(f"หา po_id ไม่เจอจาก po_ref={po_ref} ในช่วง {date_from}..{date_to}")


def build_receive_all_lines(po_detail: list[dict], warehouse_code: str) -> list[dict]:
    """
    สร้าง lines[] เพื่อรับเต็มทุกบรรทัดจาก PO detail
    ถ้ามี field packed จะใช้ remain = quantity - packed
    """
    out: list[dict] = []
    for row in po_detail or []:
        item_id = row.get("item_id") or row.get("po_item_id") or row.get("iv_item_id")
        if not item_id:
            continue
        qty = row.get("quantity") or 0
        packed = row.get("packed")
        try:
            qty_n = float(qty or 0)
            packed_n = float(packed or 0) if packed is not None else 0.0
            remain = qty_n - packed_n if packed is not None else qty_n
        except Exception:
            remain = qty
        if remain is None:
            continue
        try:
            if float(remain) <= 0:
                continue
        except Exception:
            pass

        out.append({
            "po_item_id": str(item_id),
            "product_id": row.get("product_id") or "",
            "product": row.get("description") or "",
            "quantity": remain,
            "price": row.get("price") or 0,
            "warehouse": warehouse_code,
        })
    return out


def lookup_po_from_json(po_ref: str | None, po_id: str | None) -> dict | None:
    if not os.path.isfile(PO_JSON_PATH):
        return None
    with open(PO_JSON_PATH, encoding="utf-8") as f:
        blob = json.load(f)
    orders = blob.get("orders") or []
    for o in orders:
        if po_id and str(o.get("po_id")) == str(po_id):
            return o
        if po_ref and str(o.get("po_ref")) == str(po_ref):
            return o
    return None


def build_detail_lines(doc: dict, po_detail: list[dict]) -> tuple[list[dict], list[dict]]:
    """คืน (detail[], list[]) ตาม format create_cargo"""
    by_item_id = {str(x.get("item_id")): x for x in po_detail if x.get("item_id")}
    detail_out: list[dict] = []
    list_out: list[dict] = []
    default_wh = doc.get("warehouse") or ""

    for line in doc.get("lines") or []:
        po_item_id = str(line.get("po_item_id") or line.get("item_id") or "")
        src = by_item_id.get(po_item_id, {})
        qty = line.get("quantity") or line.get("qty") or 0
        price = line.get("price") if line.get("price") is not None else src.get("price", 0)
        product_id = line.get("product_id") or src.get("product_id") or ""
        product = line.get("product") or line.get("product_name") or src.get("description") or ""
        wh = line.get("warehouse") or default_wh
        total = line_total(qty, price)

        detail_out.append({
            "po_item_id": po_item_id,
            "product_id": product_id,
            "product": product,
            "quantity": str(qty),
            "price": str(price),
            "total": f"{total:,.2f}",
            "warehouse": wh,
            "remark": line.get("remark") or "",
            "serial": line.get("serial") or "",
            "acc_code": line.get("acc_code") or "",
            "coefficient": str(line.get("coefficient") or src.get("coefficient") or "1"),
            "unit": line.get("unit") or src.get("unit") or src.get("sunit") or "",
            "type": line.get("type") or "",
        })
        list_out.append({
            "product_id": product_id,
            "quantity": qty,
            "total": total,
        })

    return detail_out, list_out


class TRCloudINCPusher:
    def __init__(self, company_id: str, passkey: str, cookie: str, user_id: str = ""):
        self.company_id = company_id
        self.passkey = passkey
        self.cookie = cookie
        self.user_id = user_id

    def build_payload(self, doc: dict, session=None) -> dict:
        po_id = str(doc.get("po_id") or doc.get("engine_id") or doc.get("id") or "")
        if not po_id:
            raise ValueError("ต้องมี po_id")

        local = lookup_po_from_json(doc.get("po_ref"), po_id) or {}
        head: dict[str, Any] = {}
        po_detail: list[dict] = []

        if doc.get("fetch_po_head", True) and session:
            try:
                fetched = fetch_po_head(session, po_id)
                head = fetched["head"]
                po_detail = fetched["detail"]
            except Exception as e:
                print(f"   ⚠️ ดึง PO head ไม่ได้: {e}")

        # รับเต็มทั้งใบ: สร้าง doc.lines จาก PO detail ถ้ายังไม่ส่ง lines มา
        if doc.get("receive_all") and not (doc.get("lines") or []):
            wh = (
                doc.get("warehouse")
                or head.get("warehouse")
                or local.get("warehouse")
                or "TN_คลังเซโปน"
            )
            doc["warehouse"] = wh
            doc["lines"] = build_receive_all_lines(po_detail, wh)

        po_ref = (
            doc.get("po_ref")
            or head.get("reference")
            or local.get("po_ref")
            or f"PO{head.get('document_number', '')}"
        )
        today = str(doc.get("date") or date.today().isoformat())
        detail, summary_list = build_detail_lines(doc, po_detail)
        if not detail:
            raise ValueError("ต้องมี lines[] อย่างน้อย 1 รายการ")

        supplier_name = (
            doc.get("name")
            or head.get("name")
            or local.get("supplier_name")
            or head.get("organization")
            or ""
        )

        payload = {
            **auth_fields(self.company_id, self.passkey, self.cookie, self.user_id),
            "po_id": po_id,
            "id": po_id,
            "engine_id": po_id,
            "type": "Receipt",
            "create_by": "cargo",
            "title": "INC",
            "company_format": "INC",
            "document_number": doc.get("document_number") or "",
            "formula": "Receipt",
            "issue_date": doc.get("issue_date") or today,
            "date": today,
            "order_date": doc.get("order_date") or head.get("issue_date") or local.get("issue_date") or today,
            "delivery_due": doc.get("delivery_due") or head.get("delivery_due") or local.get("due_date") or "",
            "reference": po_ref,
            "status": doc.get("status") or "manufacturing",
            "stage": str(doc.get("stage") or "0"),
            "request_by": doc.get("request_by") or "",
            "purpose": doc.get("purpose") or "รับสินค้าจากใบสั่งซื้อ",
            "description": doc.get("description") or head.get("description") or "",
            "contact_id": str(doc.get("contact_id") or head.get("contact_id") or ""),
            "name": supplier_name,
            "telephone": doc.get("telephone") or head.get("telephone") or "",
            "supplier": doc.get("supplier") or {
                "name": supplier_name,
                "organization": head.get("organization") or supplier_name,
                "branch": head.get("branch") or "",
                "tax_id": head.get("tax_id") or "",
                "title": head.get("title") or "",
            },
            "staff": doc.get("staff") or head.get("staff") or "",
            "department": doc.get("department") or head.get("department") or local.get("department") or "",
            "project": doc.get("project") or head.get("project") or local.get("project") or "",
            "warehouse": doc.get("warehouse") or head.get("warehouse") or "",
            "sum_quantity": sum(float(x.get("quantity") or 0) for x in summary_list),
            "url": "",
            "dropbox": [],
            "other": "{}",
            "list": summary_list,
            "detail": detail,
        }
        return payload

    def push_one(self, doc: dict, dry_run: bool = False) -> dict:
        referer = f"{BASE_URL}/application/ordermgmt_po/new_receive.php?id={doc.get('po_id')}&type=po2gr"
        session = make_session(self.cookie, referer)
        payload = self.build_payload(doc, session=session)
        ref = payload.get("reference") or payload.get("po_id")

        if dry_run:
            print(f"🔍 [dry-run] INC {ref}: {len(payload['detail'])} รายการ")
            return {"success": True, "dry_run": True, "reference": ref, "payload": payload}

        data = post_json_wrap(session, API_CREATE, payload)
        if is_success(data):
            print(f"✅ รับสินค้า INC สำเร็จ: {ref} — {data.get('message', '')}")
        else:
            print(f"❌ INC ไม่สำเร็จ: {ref} — {data.get('message', data)}")
        return data


def parse_line_arg(text: str) -> dict:
    out: dict[str, Any] = {}
    for part in text.split(","):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k, v = k.strip(), v.strip()
        if k in ("qty", "quantity"):
            out["quantity"] = float(v) if "." in v else int(v)
        else:
            out[k] = v
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TRCloud INC (รับสินค้าจาก PO) pusher")
    parser.add_argument("--company-id", default=COMPANY_ID)
    parser.add_argument("--passkey", default=PASSKEY)
    parser.add_argument("--cookie", default=None)
    parser.add_argument("--user-id", default="", help="TRCloud user_id (default: จาก cookie u=)")
    parser.add_argument("--input", help="JSON เอกสารรับสินค้า (ดู templates/inc_receive.json)")
    parser.add_argument("--po-id", help="PO id สำหรับรับทีละใบ")
    parser.add_argument("--po-ref", default="")
    parser.add_argument("--line", action="append", default=[], help="po_item_id=...,qty=...,product_id=...")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--delay", type=float, default=0.5)
    parser.add_argument("--receive-all", action="store_true", help="รับเต็มทุกบรรทัดจาก PO (ดึง detail จาก TRCloud)")
    parser.add_argument("--from", dest="date_from", default="2026-01-01", help="ช่วงวันที่ใช้ค้นหา PO (default 2026-01-01)")
    parser.add_argument("--to", dest="date_to", default=str(date.today().isoformat()), help="ช่วงวันที่ใช้ค้นหา PO (default วันนี้)")
    parser.add_argument("--warehouse", default="", help="warehouse code ปลายทาง (แนะนำใส่เมื่อ --receive-all)")
    args = parser.parse_args()

    if args.input:
        docs = load_json_input(args.input)
    elif args.po_id or args.po_ref:
        po_id = args.po_id
        cookie = args.cookie or _cookie()
        # ถ้าไม่รู้ po_id ให้ค้นด้วย po_ref
        if not po_id:
            s = make_session(cookie, f"{BASE_URL}/application/expense/po.php")
            po_id = search_po_id_by_ref(s, args.po_ref, args.date_from, args.date_to)
            print(f"🔎 พบ po_id={po_id} สำหรับ {args.po_ref}")

        lines = [parse_line_arg(x) for x in args.line] if args.line else []
        if not args.receive_all and not lines:
            parser.error("ต้องระบุ --line po_item_id=...,qty=... อย่างน้อย 1 รายการ หรือใช้ --receive-all")
        docs = [{
            "po_id": po_id,
            "po_ref": args.po_ref,
            "lines": lines,
            "fetch_po_head": True,
            "receive_all": bool(args.receive_all),
            "warehouse": args.warehouse,
        }]
    else:
        parser.error("ต้องระบุ --input หรือ --po-id")

    cookie = args.cookie or _cookie()
    pusher = TRCloudINCPusher(args.company_id, args.passkey, cookie, user_id=args.user_id)
    push_many("INC push", docs, pusher.push_one, dry_run=args.dry_run, delay=args.delay)
