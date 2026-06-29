"""
TRCloud MR Extractor — ใบเบิกสินค้า/วัตถุดิบ (Material Request)

Endpoints (ICS):
  List   : POST /application/ics/api/engine-ics/search_mr.php        (json-wrap)
  Detail : POST /application/ics/api/engine-ics/retrieve_mr.php    (json-wrap, id=mr_id)

รัน:
  py trcloud_MR.py
  py trcloud_MR.py --from 2026-01-01 --to 2026-06-30 --no-details
"""

import re
import sys
import html
import time
import os
import json
import argparse
import requests
import pandas as pd
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.adapters import HTTPAdapter

from trcloud_auth import get_cookie, get_cookie_for_company
from trcloud_config import (
    COMPANY_ID, DATE_FROM, DATE_TO, ORIGIN_PASSKEY,
    OUTPUT_DIR, PASSKEY, USE_COMPANY_SWITCH,
)

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

# =============================================================================
# CONFIG — ค่าจาก .env
# =============================================================================

COOKIE = (
    get_cookie_for_company(COMPANY_ID, origin_passkey=ORIGIN_PASSKEY)
    if USE_COMPANY_SWITCH
    else get_cookie()
)

SLEEP_SECONDS   = 0.15
MAX_WORKERS     = 8
INCLUDE_DETAILS = True
OUTPUT_JSON_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "apps", "api", "data",
)

BASE_URL = "https://thaidrill.trcloud.co/application"
API_LIST     = f"{BASE_URL}/ics/api/engine-ics/search_mr.php"
API_RETRIEVE = f"{BASE_URL}/ics/api/engine-ics/retrieve_mr.php"
REFERER      = f"{BASE_URL}/ics/material_request.php"

MR_PRIORITY = [
    "doc_ref", "document_number", "mr_id", "title", "date", "issue_date",
    "status", "approve_status", "request_by", "purpose", "client_name",
    "organization", "department", "project", "warehouse", "salesman",
    "sum_quantity", "sum_receive", "description", "reference", "company_id",
]

TEXT_COLS = ["description", "remark", "note", "purpose", "name", "organization", "client_name"]


def clean_html_text(raw_text: str) -> str:
    if not raw_text or not isinstance(raw_text, str):
        return ""
    text = raw_text
    text = re.sub(r'(?i)<script\b[^<]*(?:(?!</script>)<[^<]*)*</script>', '', text)
    text = re.sub(r'(?i)<style\b[^<]*(?:(?!</style>)<[^<]*)*</style>', '', text)
    text = re.sub(r'(?i)<\s*br\s*/?\s*>', '\n', text)
    text = re.sub(r'(?i)</\s*(p|div|li|tr)\s*>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n', text)
    return text.strip()


def format_doc_ref(row: dict, default_title: str = "MR") -> str:
    title = str(row.get("title") or row.get("company_format") or default_title).strip()
    num = str(row.get("document_number") or row.get("doc_number") or "").strip()
    if not num:
        return title
    ref = f"{title}{num}" if not str(title).endswith(num) else f"{title}{num}"
    if num and not ref.upper().startswith(default_title):
        ref = f"{default_title}{num}"
    return ref


def make_session(cookie: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": REFERER,
        "Cookie": cookie,
    })
    adapter = HTTPAdapter(pool_connections=MAX_WORKERS, pool_maxsize=MAX_WORKERS)
    s.mount("https://", adapter)
    return s


def list_payload(date_from: str, date_to: str, start: int = 0, **kw) -> dict:
    return {
        "company_id": COMPANY_ID,
        "passkey": PASSKEY,
        "start": start,
        "keyword": kw.get("keyword", ""),
        "status": kw.get("status", ""),
        "from": date_from,
        "to": date_to,
        "activate_date": kw.get("activate_date", "on"),
        "sort": kw.get("sort", ""),
    }


def post_json(session: requests.Session, url: str, payload: dict, timeout: int = 60) -> dict:
    r = session.post(url, data={"json": json.dumps(payload)}, timeout=timeout)
    r.raise_for_status()
    return r.json()


def paginate_list(session: requests.Session, url: str, id_key: str,
                  date_from: str, date_to: str) -> list:
    """ICS MR API ไม่ส่ง count — วนจนกว่าหน้าว่างหรือไม่มีแถวใหม่"""
    records, seen, page, total = [], set(), 0, None
    while True:
        res = post_json(session, url, list_payload(date_from, date_to, start=page))
        if res.get("success") != 1:
            print(f"   ⚠️ API: {res.get('message', 'unknown')}")
            break
        if total is None:
            raw_count = res.get("count")
            total = int(raw_count) if raw_count not in (None, "", 0, "0") else None
            if total:
                print(f"   → MR ทั้งหมด {total} ใบ (ตาม API)")
        items = res.get("result", []) or []
        if not items:
            break
        new_rows = 0
        for it in items:
            pid = it.get(id_key) or it.get("id")
            if pid and pid not in seen:
                seen.add(pid)
                records.append(it)
                new_rows += 1
        print(f"   page {page} | got {len(items)} | new {new_rows} | สะสม {len(records)}")
        if total and len(records) >= total:
            break
        if not new_rows:
            break
        page += 1
        time.sleep(SLEEP_SECONDS)
    print(f"   → MR รวม {len(records)} ใบ")
    return records


def clean_list_rows(records: list) -> list:
    out = []
    for row in records:
        r = row.copy()
        for col in TEXT_COLS:
            if r.get(col) is not None:
                r[col] = clean_html_text(str(r[col]))
        r["doc_ref"] = format_doc_ref(r, "MR")
        ordered = {c: r[c] for c in MR_PRIORITY if c in r}
        for c in r:
            if c not in ordered:
                ordered[c] = r[c]
        out.append(ordered)
    return out


def _detail_worker(session: requests.Session, rec: dict) -> list:
    mid = rec.get("mr_id") or rec.get("id")
    if not mid:
        return []
    lines = []
    try:
        d = post_json(session, API_RETRIEVE, {
            "company_id": COMPANY_ID, "passkey": PASSKEY, "id": str(mid),
        })
        if d.get("success") != 1:
            return []
        head = d.get("head") or {}
        doc_ref = format_doc_ref({**rec, **head}, "MR")
        for line in (d.get("body") or d.get("detail") or []):
            product = line.get("product") or line.get("description") or ""
            lines.append({
                "mr_id": mid,
                "doc_ref": doc_ref,
                "document_number": rec.get("document_number") or head.get("document_number"),
                "date": head.get("date") or rec.get("date"),
                "request_by": head.get("request_by") or rec.get("request_by"),
                "department": head.get("department") or rec.get("department"),
                "project": head.get("project") or rec.get("project"),
                "warehouse": line.get("warehouse") or head.get("warehouse"),
                "mrd_id": line.get("mrd_id"),
                "product_id": line.get("product_id"),
                "product_name": clean_html_text(str(product)) if product else "",
                "quantity": line.get("quantity"),
                "unit": line.get("unit") or line.get("sunit"),
                "price": line.get("price"),
                "item_total": line.get("total"),
                "remark": clean_html_text(str(line.get("remark") or "")),
                "serial": line.get("serial"),
                "acc_code": line.get("acc_code"),
                "status": line.get("status"),
            })
    except Exception:
        pass
    return lines


def fetch_details_parallel(session: requests.Session, records: list) -> list:
    lines, done, total = [], 0, len(records)
    if not records:
        return lines
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = [ex.submit(_detail_worker, session, rec) for rec in records]
        for fut in as_completed(futures):
            try:
                lines.extend(fut.result() or [])
            except Exception:
                pass
            done += 1
            if done % 25 == 0 or done == total:
                print(f"   📥 MR detail {done}/{total} ({len(lines)} items)")
    return lines


def export_excel(doc_list: list, line_items: list, timestamp: str) -> str:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, f"TRCLOUD_MR_Export_{timestamp}.xlsx")
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        pd.DataFrame(doc_list).to_excel(writer, sheet_name="MR_Summary", index=False)
        pd.DataFrame(line_items).to_excel(writer, sheet_name="MR_LineItems", index=False)
        print(f"   📄 MR_Summary: {len(doc_list)} | MR_LineItems: {len(line_items)}")
    return out_path


def export_json(doc_list: list, line_items: list, date_from: str, date_to: str) -> str:
    os.makedirs(OUTPUT_JSON_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_JSON_DIR, "mr.json")
    orders = []
    for row in doc_list:
        mid = str(row.get("mr_id") or "")
        matched = [ln for ln in line_items if str(ln.get("mr_id")) == mid]
        orders.append({
            "mr_id": mid,
            "doc_ref": row.get("doc_ref") or format_doc_ref(row, "MR"),
            "document_number": row.get("document_number"),
            "issue_date": row.get("date") or row.get("issue_date") or "",
            "request_by": row.get("request_by") or "",
            "purpose": row.get("purpose") or "",
            "department": row.get("department") or "",
            "project": row.get("project") or "",
            "warehouse": row.get("warehouse") or "",
            "status": row.get("status") or "",
            "approve_status": row.get("approve_status") or "",
            "line_count": len(matched),
            "products": [ln.get("product_name") for ln in matched if ln.get("product_name")],
        })
    payload = {
        "fetched_at": datetime.now().isoformat(timespec="seconds"),
        "date_from": date_from,
        "date_to": date_to,
        "source": "trcloud",
        "count": len(orders),
        "orders": orders,
        "lines": line_items,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, default=str)
    print(f"\n📦 บันทึก JSON → {out_path}")
    return out_path


def fetch_mr(date_from: str, date_to: str, with_details: bool = True):
    session = make_session(COOKIE)
    print(f"🚀 [MR] ดึง list ({date_from} → {date_to})...")
    raw = paginate_list(session, API_LIST, "mr_id", date_from, date_to)
    doc_list = clean_list_rows(raw)
    line_items = fetch_details_parallel(session, raw) if with_details else []
    print(f"✅ MR: {len(doc_list)} ใบ | {len(line_items)} line items")
    return doc_list, line_items


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TRCloud MR extractor")
    parser.add_argument("--from", dest="date_from", default=DATE_FROM)
    parser.add_argument("--to", dest="date_to", default=DATE_TO)
    parser.add_argument("--no-details", dest="with_details", action="store_false")
    parser.set_defaults(with_details=INCLUDE_DETAILS)
    args = parser.parse_args()

    print("=" * 60)
    print("  TRCLOUD MR Extractor")
    print(f"  ช่วง: {args.date_from} → {args.date_to} | company {COMPANY_ID}")
    print("=" * 60)

    docs, lines = fetch_mr(args.date_from, args.date_to, args.with_details)
    if docs:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        export_excel(docs, lines, ts)
        export_json(docs, lines, args.date_from, args.date_to)
        print("\n🎉 เสร็จสมบูรณ์!")
    else:
        print("⚠️ ไม่พบข้อมูล MR ในช่วงเวลาที่ระบุ")
