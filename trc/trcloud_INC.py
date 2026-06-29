"""
TRCloud INC Extractor — รับสินค้าเข้าคลังจาก PO (Cargo / engine-cargo)

หน้า TRCloud: /application/ordermgmt_po/cargo.php
  List   : POST .../ordermgmt_po/api/engine-cargo/cargo_search_keyword.php  (form-urlencoded)
  Detail : POST .../ordermgmt_po/api/engine-cargo/show_detail.php           (json-wrap, id=document_id)

เชื่อม PO: reference = เลข PO, reference_id = po_id, detail[].po_item_id

รัน:
  py trcloud_INC.py
  py trcloud_INC.py --from 2026-01-01 --to 2026-06-30
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

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

# =============================================================================
# CONFIG
# =============================================================================
DATE_FROM = "2026-01-01"
DATE_TO   = "2026-06-30"

COMPANY_ID = "25"
PASSKEY    = "6a05946b357765415b4c931d2122a8c8"
USE_COMPANY_SWITCH = False
ORIGIN_PASSKEY     = "6a05946b357765415b4c931d2122a8c8"

COOKIE = (
    get_cookie_for_company(COMPANY_ID, origin_passkey=ORIGIN_PASSKEY)
    if USE_COMPANY_SWITCH
    else get_cookie()
)

SLEEP_SECONDS   = 0.15
MAX_WORKERS     = 8
INCLUDE_DETAILS = True
OUTPUT_DIR      = r"C:\Users\Lenovo\Music\Python\Full Excel"
OUTPUT_JSON_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "warehouse-app", "apps", "api", "data",
)

BASE_URL = "https://thaidrill.trcloud.co/application"
API_LIST     = f"{BASE_URL}/ordermgmt_po/api/engine-cargo/cargo_search_keyword.php"
API_RETRIEVE = f"{BASE_URL}/ordermgmt_po/api/engine-cargo/show_detail.php"
REFERER      = f"{BASE_URL}/ordermgmt_po/cargo.php"

INC_PRIORITY = [
    "doc_ref", "document_number", "document_id", "company_format", "title",
    "issue_date", "order_date", "delivery_due", "status",
    "name", "organization", "reference", "reference_id",
    "staff", "department", "project", "warehouse", "create_by",
    "sum_quantity", "sum_weight", "company_id",
]

TEXT_COLS = ["description", "remark", "note", "name", "organization", "invoice_note"]


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


def format_doc_ref(row: dict, default_title: str = "INC") -> str:
    cf = str(row.get("company_format") or default_title).strip()
    num = str(row.get("document_number") or "").strip()
    if not num:
        return cf
    ref = f"{cf}{num}"
    if not ref.upper().startswith("INC"):
        ref = f"INC{num}"
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


def list_payload(date_from: str, date_to: str, start: int = 0) -> dict:
    """INC list ใช้ form-urlencoded (ไม่ใช่ json-wrap)"""
    return {
        "company_id": COMPANY_ID,
        "passkey": PASSKEY,
        "keyword": "",
        "start": start,
        "filter": "",
        "from": date_from,
        "to": date_to,
        "activate_date": "on",
        "sort": "",
        "id": "",
    }


def post_form(session: requests.Session, url: str, payload: dict,
              json_wrap: bool = False, timeout: int = 60) -> dict:
    data = {"json": json.dumps(payload)} if json_wrap else payload
    r = session.post(url, data=data, timeout=timeout)
    r.raise_for_status()
    return r.json()


def paginate_list(session: requests.Session, date_from: str, date_to: str) -> list:
    records, seen, page, total = [], set(), 0, None
    while True:
        res = post_form(session, API_LIST, list_payload(date_from, date_to, start=page))
        if res.get("success") != 1:
            print(f"   ⚠️ API: {res.get('message', 'unknown')}")
            break
        if total is None:
            total = int(res.get("count", 0) or 0)
            print(f"   → INC ทั้งหมด {total} ใบ")
        items = res.get("result", []) or []
        if not items:
            break
        for it in items:
            pid = it.get("document_id") or it.get("id")
            if pid and pid not in seen:
                seen.add(pid)
                records.append(it)
        if total and len(records) >= total:
            break
        if len(items) < 50:
            break
        page += 1
        time.sleep(SLEEP_SECONDS)
    return records


def clean_list_rows(records: list) -> list:
    out = []
    for row in records:
        r = row.copy()
        for col in TEXT_COLS:
            if r.get(col) is not None:
                r[col] = clean_html_text(str(r[col]))
        r["doc_ref"] = format_doc_ref(r, "INC")
        ordered = {c: r[c] for c in INC_PRIORITY if c in r}
        for c in r:
            if c not in ordered:
                ordered[c] = r[c]
        out.append(ordered)
    return out


def _detail_worker(session: requests.Session, rec: dict) -> list:
    did = rec.get("document_id") or rec.get("id")
    if not did:
        return []
    lines = []
    try:
        d = post_form(session, API_RETRIEVE, {
            "company_id": COMPANY_ID,
            "passkey": PASSKEY,
            "id": str(did),
        }, json_wrap=True)
        if d.get("success") != 1:
            return []
        head = d.get("head") or {}
        doc_ref = format_doc_ref({**rec, **head}, "INC")
        po_ref = head.get("reference") or rec.get("reference") or ""
        po_id = head.get("reference_id") or rec.get("reference_id") or ""
        for line in (d.get("detail") or d.get("body") or []):
            desc = line.get("description") or line.get("product") or ""
            lines.append({
                "document_id": did,
                "doc_ref": doc_ref,
                "document_number": rec.get("document_number") or head.get("document_number"),
                "po_ref": po_ref,
                "po_id": po_id,
                "issue_date": head.get("issue_date") or rec.get("issue_date"),
                "organization": head.get("organization") or rec.get("organization") or rec.get("name"),
                "department": head.get("department") or rec.get("department"),
                "project": head.get("project") or rec.get("project"),
                "warehouse": line.get("warehouse") or head.get("warehouse"),
                "item_id": line.get("item_id"),
                "po_item_id": line.get("po_item_id"),
                "product_id": line.get("product_id"),
                "product_name": clean_html_text(str(desc)) if desc else "",
                "quantity": line.get("quantity"),
                "weight": line.get("weight"),
                "total_weight": line.get("total_weight"),
                "unit": line.get("unit") or line.get("sunit"),
                "coefficient": line.get("coefficient"),
                "converter": line.get("converter"),
                "serial": line.get("serial"),
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
                print(f"   📥 INC detail {done}/{total} ({len(lines)} items)")
    return lines


def export_excel(doc_list: list, line_items: list, timestamp: str) -> str:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, f"TRCLOUD_INC_Export_{timestamp}.xlsx")
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        pd.DataFrame(doc_list).to_excel(writer, sheet_name="INC_Summary", index=False)
        pd.DataFrame(line_items).to_excel(writer, sheet_name="INC_LineItems", index=False)
        print(f"   📄 INC_Summary: {len(doc_list)} | INC_LineItems: {len(line_items)}")
    return out_path


def export_json(doc_list: list, line_items: list, date_from: str, date_to: str) -> str:
    os.makedirs(OUTPUT_JSON_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_JSON_DIR, "inc.json")
    orders = []
    for row in doc_list:
        did = str(row.get("document_id") or "")
        matched = [ln for ln in line_items if str(ln.get("document_id")) == did]
        orders.append({
            "document_id": did,
            "doc_ref": row.get("doc_ref") or format_doc_ref(row, "INC"),
            "document_number": row.get("document_number"),
            "issue_date": row.get("issue_date") or "",
            "po_ref": row.get("reference") or "",
            "po_id": str(row.get("reference_id") or ""),
            "supplier_name": row.get("organization") or row.get("name") or "",
            "department": row.get("department") or "",
            "project": row.get("project") or "",
            "warehouse": row.get("warehouse") or "",
            "status": row.get("status") or "",
            "sum_quantity": row.get("sum_quantity"),
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


def fetch_inc(date_from: str, date_to: str, with_details: bool = True):
    session = make_session(COOKIE)
    print(f"🚀 [INC] ดึง list ({date_from} → {date_to})...")
    raw = paginate_list(session, date_from, date_to)
    doc_list = clean_list_rows(raw)
    line_items = fetch_details_parallel(session, raw) if with_details else []
    print(f"✅ INC: {len(doc_list)} ใบ | {len(line_items)} line items")
    return doc_list, line_items


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TRCloud INC (cargo) extractor")
    parser.add_argument("--from", dest="date_from", default=DATE_FROM)
    parser.add_argument("--to", dest="date_to", default=DATE_TO)
    parser.add_argument("--no-details", dest="with_details", action="store_false")
    parser.set_defaults(with_details=INCLUDE_DETAILS)
    args = parser.parse_args()

    print("=" * 60)
    print("  TRCLOUD INC Extractor (รับสินค้าจาก PO)")
    print(f"  ช่วง: {args.date_from} → {args.date_to} | company {COMPANY_ID}")
    print("=" * 60)

    docs, lines = fetch_inc(args.date_from, args.date_to, args.with_details)
    if docs:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        export_excel(docs, lines, ts)
        export_json(docs, lines, args.date_from, args.date_to)
        print("\n🎉 เสร็จสมบูรณ์!")
    else:
        print("⚠️ ไม่พบข้อมูล INC ในช่วงเวลาที่ระบุ")
