# -*- coding: utf-8 -*-
"""
TRCloud Common Fetcher (ICS / inventory family)
================================================
โครงสร้างกลางสำหรับดึงเอกสารตระกูล ICS (MR / GR / INC / PO)
ทุก endpoint ใช้รูปแบบ json-wrapped POST:  body =  json={...}
และ envelope มาตรฐาน  {success, message, result:[...]}  (list)
                       {success, head, body:[...], gl, ...}  (detail)

ใช้ร่วมกับ trcloud_auth.get_cookie_for_company() สำหรับ auth
ตัวสคริปต์แต่ละชนิด (trcloud_MR.py ฯลฯ) แค่ส่ง DocConfig เข้ามา
"""

import os
import re
import sys
import html
import json
import time
import requests
from typing import Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from trcloud_env import env

# บังคับ console ให้เป็น UTF-8 (กัน UnicodeEncodeError จากภาษาไทย/emoji บน Windows cp1252)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_URL = env("TRCLOUD_ERP_URL", "https://thaidrill.trcloud.co")
JSON_SCHEMA_VERSION = 2


# ============================================================
# Config ของเอกสารแต่ละชนิด
# ============================================================
@dataclass
class DocConfig:
    name: str                 # ชื่อย่อใช้ใน log/ชีต เช่น "MR"
    list_path: str            # path ของ list endpoint (ต่อจาก BASE_URL)
    detail_path: str          # path ของ detail endpoint
    id_field: str             # ชื่อ field id ในแต่ละ record เช่น "mr_id"
    referer: str              # หน้าเว็บที่ใช้เป็น Referer
    # ทุก endpoint ของ TRCloud ใช้ pagination แบบ page-index: start = หมายเลขหน้า (0,1,2,...)
    # คืนหน้าละ ~51 แถว (ซ้อนกัน 1 แถว, ตัดซ้ำด้วย id) — อย่าตั้งเป็น 50 เด็ดขาด มิฉะนั้นจะข้ามหน้า
    page_step: int = 1
    # วิธีเข้ารหัส payload ของ list:
    #   "json" = ส่งแบบ json={...}  (ตระกูล ICS: MR/GR)
    #   "form" = ส่งแบบ form-urlencoded ตรงๆ (ตระกูล bill/expense: PO)
    list_encoding: str = "json"
    detail_encoding: str = "json"   # detail ของทุกชนิดที่เจอใช้ json-wrap
    # field เพิ่มเติมที่จะใส่ลงใน list payload (เช่น status="")
    extra_list_fields: dict = field(default_factory=dict)


# ============================================================
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


_TEXT_COLS_TO_CLEAN = ['description', 'remark', 'note', 'name', 'organization',
                       'title', 'purpose', 'product', 'request_by']


def _to_number(val: Any) -> float:
    if val is None or val == '':
        return 0.0
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _to_baht(val: Any) -> float:
    """TRCloud เก็บราคาเป็นสตางค์ (÷100) — คืนหน่วยบาท"""
    n = _to_number(val)
    if n == 0:
        return 0.0
    return round(n / 100.0, 4)


def _product_category(product_id: str) -> str:
    """ดึงรหัสหมวดจาก SKU เช่น C-GN-GN-91940 → GN"""
    if not product_id:
        return ''
    parts = str(product_id).split('-')
    if len(parts) >= 3:
        return parts[1]
    return parts[0] if parts else ''


def _pick(*vals: Any) -> Any:
    for v in vals:
        if v is not None and v != '':
            return v
    return ''


def project_matches(project: str, filter_text: str) -> bool:
    """Match project code by prefix (case-insensitive), e.g. TN → TN-658."""
    if not filter_text:
        return True
    proj = (project or "").strip().upper()
    filt = filter_text.strip().upper()
    return bool(proj) and proj.startswith(filt)


def filter_records_by_project(records: list, filter_text: str, doc_name: str = "") -> list:
    if not filter_text or not records:
        return records
    kept = [r for r in records if project_matches(r.get("project"), filter_text)]
    dropped = len(records) - len(kept)
    label = doc_name or "เอกสาร"
    print(f"🔎 {label}: กรองโครงการ {filter_text} → เหลือ {len(kept)} จาก {len(records)} รายการ")
    if dropped:
        print(f"   (ตัดออก {dropped} รายการที่ไม่ใช่โครงการ {filter_text})")
    return kept


def _clean_records(records: list) -> list:
    out = []
    for row in records:
        new_row = dict(row)
        for col in _TEXT_COLS_TO_CLEAN:
            if new_row.get(col) is not None:
                new_row[col] = clean_html_text(str(new_row[col]))
        out.append(new_row)
    return out


class TRCloudICSFetcher:
    """
    Fetcher กลางสำหรับเอกสารตระกูล ICS (MR / GR / INC / PO)
    """

    def __init__(self, cfg: DocConfig, company_id: str, passkey: str, raw_cookie: str):
        self.cfg = cfg
        self.company_id = company_id
        self.passkey = passkey
        self.base_url = BASE_URL
        self.list_url = f"{self.base_url}{cfg.list_path}"
        self.detail_url = f"{self.base_url}{cfg.detail_path}"

        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": self.base_url,
            "Referer": f"{self.base_url}{cfg.referer}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Cookie": raw_cookie,
        })

    # ------------------------------------------
    # Payload builders
    # ------------------------------------------
    def _list_payload(self, date_from: str, date_to: str, start: int = 0, **kw) -> dict:
        payload = {
            "company_id": self.company_id,
            "passkey": self.passkey,
            "start": start,
            "keyword": kw.get("keyword", ""),
            "status": kw.get("status", ""),
            "from": date_from,
            "to": date_to,
            "activate_date": "on" if kw.get("use_date_filter", True) else "off",
            "sort": kw.get("sort", ""),
        }
        # ตระกูล bill/expense (form) ต้องมี date_from/date_to + filter ด้วย
        if self.cfg.list_encoding == "form":
            payload.update({"date_from": date_from, "date_to": date_to, "filter": ""})
        # field เฉพาะเอกสาร + override จาก caller
        payload.update(self.cfg.extra_list_fields)
        for k in ("department", "project", "staff", "source", "keyword"):
            if kw.get(k):
                payload[k] = kw[k]
        return payload

    def _post(self, url: str, payload: dict, encoding: str, timeout: int = 60) -> Optional[dict]:
        """ยิง endpoint (json-wrap หรือ form) แล้วคืน dict (None ถ้า fail)"""
        if encoding == "form":
            data = payload
        else:
            data = {"json": json.dumps(payload, ensure_ascii=False)}
        try:
            response = self.session.post(url, data=data, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"❌ Network Error ({self.cfg.name}) {url.split('/')[-1]}: {e}")
        except json.JSONDecodeError:
            print(f"❌ JSON Decode Error ({self.cfg.name}) {url.split('/')[-1]}")
        return None

    # ------------------------------------------
    # List (paginated)
    # ------------------------------------------
    def fetch_list(self, date_from: str, date_to: str, sleep_between: float = 0.3, **kw) -> list:
        all_records = []
        seen_ids = set()
        start = 0
        total = None
        idf = self.cfg.id_field
        print(f"🚀 เริ่มดึงข้อมูล {self.cfg.name} ({date_from} → {date_to})")

        while True:
            payload = self._list_payload(date_from, date_to, start=start, **kw)
            data = self._post(self.list_url, payload, self.cfg.list_encoding)
            if data is None:
                break

            if data.get("success") != 1:
                print(f"❌ API Error ({self.cfg.name}): {data.get('message', 'Unknown Error')}")
                break

            results = data.get("result", []) or []
            if total is None:
                total = int(data.get("count", 0) or 0)
                print(f"📊 มีเอกสาร {self.cfg.name} ทั้งหมด (ตาม filter): {total or 'ไม่ระบุ'} รายการ")

            if not results:
                print(f"ℹ️  {self.cfg.name} start={start} — ไม่มีข้อมูล (หยุด)")
                break

            new_rows = [r for r in results if (r.get(idf) or r.get("id")) not in seen_ids]
            for r in new_rows:
                seen_ids.add(r.get(idf) or r.get("id"))
            all_records.extend(new_rows)

            pct = (len(all_records) / total * 100) if total else 0
            print(f"✅ {self.cfg.name} start={start} | got {len(results)} | new {len(new_rows)} | "
                  f"accumulated {len(all_records)}/{total or '?'} ({pct:.1f}%)")

            if total and len(all_records) >= total:
                break
            if not new_rows:
                print(f"ℹ️  {self.cfg.name} start={start} — ไม่มีรายการใหม่ (หยุด)")
                break

            start += self.cfg.page_step
            if sleep_between:
                time.sleep(sleep_between)

        print(f"🎉 {self.cfg.name} เสร็จสิ้น ได้ {len(all_records)} รายการ")
        return all_records

    # ------------------------------------------
    # Detail (header + item)
    # ------------------------------------------
    def fetch_detail(self, doc_id) -> Optional[dict]:
        """retrieve_*.php — คืน {head, body, gl, ...} ของเอกสารแต่ละใบ"""
        payload = {
            "company_id": self.company_id,
            "passkey": self.passkey,
            "id": str(doc_id),
        }
        data = self._post(self.detail_url, payload, self.cfg.detail_encoding, timeout=30)
        if data is None or data.get("success") not in (1, "1", True):
            # บาง endpoint ไม่ส่ง success ใน detail — ยอมรับถ้ามี head/body
            if data and ("head" in data or "body" in data):
                return data
            return None
        return data

    def extract_items(self, records: list, sleep_between: float = 0.0) -> tuple[list, dict]:
        """
        วน fetch_detail() ทุก doc
        คืน (item_rows, detail_heads) — detail_heads ใช้เติม order ระดับหัวเอกสาร
        """
        item_rows = []
        detail_heads: dict[str, dict] = {}
        idf = self.cfg.id_field
        n = len(records)
        for i, rec in enumerate(records, 1):
            doc_id = rec.get(idf) or rec.get("id")
            if not doc_id:
                continue

            data = self.fetch_detail(doc_id)
            if not data:
                continue

            head = data.get("head") or {}
            gl = data.get("gl") or {}
            if not isinstance(gl, dict):
                gl = {}
            body = data.get("body") or data.get("detail") or []

            doc_number = _pick(
                head.get("document_number"), rec.get("document_number"),
                head.get("doc_number"), rec.get("doc_number"),
            )
            title = _pick(head.get("title"), rec.get("title"), self.cfg.name)

            head_ctx = {
                'doc_id':          str(doc_id),
                'doc_number':      str(doc_number),
                'doc_ref':         self._format_doc_ref({**rec, **head, 'title': title}, self.cfg),
                'title':           title,
                'date':            str(_pick(
                    head.get('date'), head.get('issue_date'), head.get('order_date'),
                    rec.get('date'), rec.get('issue_date'), rec.get('order_date'),
                )),
                'status':          _pick(head.get('status'), rec.get('status')),
                'request_by':      _pick(head.get('request_by'), rec.get('request_by')),
                'purpose':         clean_html_text(str(_pick(head.get('purpose'), rec.get('purpose')))),
                'name':            _pick(head.get('name'), head.get('client_name'), rec.get('name')),
                'telephone':       _pick(head.get('telephone'), head.get('client_telephone'), rec.get('telephone')),
                'department':      _pick(head.get('department'), rec.get('department')),
                'project':         _pick(head.get('project'), rec.get('project')),
                'warehouse':       _pick(head.get('warehouse'), rec.get('warehouse')),
                'reference':       _pick(head.get('reference'), head.get('source'), rec.get('source'), rec.get('reference')),
                'create_by':       _pick(head.get('create_by'), rec.get('create_by')),
                'approve_status':  _pick(head.get('approve_status'), rec.get('approve_status')),
                'approve_date':    str(_pick(head.get('approve_date'), rec.get('approve_date'))),
                'stage':           _pick(head.get('stage'), rec.get('stage')),
                'salesman':        _pick(head.get('salesman'), head.get('staff'), rec.get('salesman')),
                'description':     clean_html_text(str(_pick(head.get('description'), rec.get('description')))),
                'sum_quantity':    _pick(head.get('sum_quantity'), rec.get('sum_quantity')),
                'sum_receive':     _pick(head.get('sum_receive'), rec.get('sum_receive')),
                'client_name':     _pick(head.get('client_name'), rec.get('client_name')),
                'po_ref':          _pick(rec.get('po_ref'), head.get('po_ref'), rec.get('reference')),
                'po_id':           str(_pick(rec.get('po_id'), rec.get('reference_id'), head.get('po_id'))),
                'organization':    _pick(rec.get('organization'), head.get('organization'), head.get('name')),
                'source_created_at': str(_pick(gl.get('create_dt'), head.get('create_dt'), rec.get('create_dt'))),
                'source_updated_at': str(_pick(gl.get('update_dt'), head.get('update_dt'), rec.get('update_dt'))),
                'source_updater_id': str(_pick(gl.get('updater_id'), head.get('updater_id'), rec.get('updater_id'))),
                'gl_transaction_id': str(_pick(gl.get('transaction_id'), head.get('transaction_id'), rec.get('transaction_id'))),
            }
            detail_heads[str(doc_id)] = head_ctx

            for line_no, it in enumerate(body or [], 1):
                row = dict(head_ctx)
                product_id = _pick(it.get('product_id'), it.get('product_code'))
                product_name = clean_html_text(str(_pick(it.get('product'), it.get('description'), '')))
                qty = _to_number(it.get('quantity'))
                unit_price_raw = _pick(it.get('price'), it.get('unit_price'))
                line_total_raw = _pick(it.get('total'), it.get('item_total'))
                if not line_total_raw and unit_price_raw and qty:
                    line_total_raw = _to_number(unit_price_raw) * qty

                row.update({
                    'line_no':         line_no,
                    'doc_item':        f"{doc_number} {product_id}".strip(),
                    'product_id':      product_id,
                    'product_name':    product_name,
                    'quantity':        qty,
                    'unit':            _pick(it.get('unit'), it.get('sunit')),
                    'price_raw':       str(unit_price_raw) if unit_price_raw != '' else '',
                    'item_total_raw':  str(line_total_raw) if line_total_raw != '' else '',
                    'unit_cost_baht':  _to_baht(unit_price_raw),
                    'line_total_baht': _to_baht(line_total_raw),
                    'remark':          clean_html_text(str(it.get('remark') or '')),
                    'serial':          str(it.get('serial') or ''),
                    'acc_code':        str(it.get('acc_code') or ''),
                    'warehouse_line':  _pick(it.get('warehouse'), head_ctx.get('warehouse')),
                    'coefficient':     _pick(it.get('coefficient'), '1'),
                    'category_code':   _product_category(str(product_id)),
                    'line_status':     _pick(it.get('status'), it.get('type')),
                    'mrd_id':          str(it.get('mrd_id') or it.get('item_id') or ''),
                    'mr_item_id':      str(it.get('mr_item_id') or it.get('po_item_id') or ''),
                    'po_item_id':      str(it.get('po_item_id') or it.get('iv_item_id') or ''),
                    'item_id':         str(it.get('item_id') or it.get('mrd_id') or ''),
                    'weight':          str(it.get('weight') or ''),
                    'receive':         _pick(it.get('receive'), ''),
                })
                # field เพิ่มจาก TRCloud ที่ไม่ทับ key หลัก
                for k, v in it.items():
                    if k in row or k in head_ctx:
                        continue
                    if isinstance(v, str) and ('<' in v or '&' in v):
                        v = clean_html_text(v)
                    row[f'extra_{k}'] = v
                item_rows.append(row)

            if i % 20 == 0 or i == n:
                print(f"   📥 {self.cfg.name} detail {i}/{n} ({len(item_rows)} lines)")
            if sleep_between:
                time.sleep(sleep_between)

        return item_rows, detail_heads

    # ------------------------------------------
    # Normalize → JSON (รูปแบบเดียวกับ warehouse-app/apps/api/data/*.json)
    # ------------------------------------------
    @staticmethod
    def _format_doc_ref(rec: dict, cfg: DocConfig) -> str:
        title = str(rec.get('title') or cfg.name or '').strip().upper()
        cf = str(rec.get('company_format') or title).strip().upper()
        num = str(rec.get('document_number') or rec.get('doc_number') or '').strip()
        if not num:
            return ''
        if cf and num.startswith(cf):
            return f"{cf}{num[len(cf):]}" if not num.upper().startswith(cf) else num
        ref = f"{cf}{num}"
        if cfg.name == 'PO' and not ref.upper().startswith('PO'):
            ref = f"PO{num}"
        return ref

    def _normalize_order(self, rec: dict, detail: Optional[dict], line_stats: Optional[dict]) -> dict:
        merged = {**_clean_records([rec])[0], **(detail or {})}
        cfg = self.cfg
        idf = cfg.id_field
        doc_id = str(merged.get(idf) or merged.get('doc_id') or merged.get('id') or '')
        doc_ref = merged.get('doc_ref') or self._format_doc_ref(merged, cfg)
        doc_num = str(merged.get('document_number') or merged.get('doc_number') or '')
        issue_date = str(_pick(merged.get('issue_date'), merged.get('date')))
        stats = line_stats or {}

        base = {
            'doc_ref': doc_ref,
            'document_number': doc_num,
            'issue_date': issue_date,
            'department': merged.get('department') or '',
            'project': merged.get('project') or '',
            'warehouse': merged.get('warehouse') or '',
            'status': merged.get('status') or '',
            'approve_status': merged.get('approve_status') or '',
            'approve_date': str(merged.get('approve_date') or ''),
            'stage': str(merged.get('stage') or ''),
            'reference': merged.get('reference') or '',
            'description': merged.get('description') or merged.get('purpose') or '',
            'line_count': stats.get('line_count', 0),
            'sum_quantity': stats.get('sum_quantity', 0),
            'total_value_baht': stats.get('total_value_baht', 0),
            'unique_skus': stats.get('unique_skus', 0),
            'products': stats.get('product_names', []),
            'product_summary': stats.get('product_summary', []),
            'source_created_at': str(merged.get('source_created_at') or merged.get('create_dt') or ''),
            'source_updated_at': str(merged.get('source_updated_at') or merged.get('update_dt') or ''),
            'source_updater_id': str(merged.get('source_updater_id') or merged.get('updater_id') or ''),
            'gl_transaction_id': str(merged.get('gl_transaction_id') or merged.get('transaction_id') or ''),
        }

        if cfg.name == 'GR':
            return {
                'receive_id': doc_id,
                **base,
                'supplier_name': _pick(merged.get('name'), merged.get('supplier_name'), merged.get('organization')),
                'request_by': merged.get('request_by') or '',
                'telephone': merged.get('telephone') or '',
                'create_by': merged.get('create_by') or 'goods_receive',
            }
        if cfg.name == 'MR':
            return {
                'mr_id': doc_id,
                **base,
                'request_by': merged.get('request_by') or '',
                'purpose': merged.get('purpose') or '',
                'client_name': merged.get('client_name') or '',
                'salesman': merged.get('salesman') or '',
                'sum_receive': str(merged.get('sum_receive') or ''),
            }
        if cfg.name == 'PO':
            return {
                'po_id': doc_id,
                'po_ref': doc_ref,
                'supplier_name': _pick(merged.get('organization'), merged.get('name'), merged.get('supplier_name')),
                'due_date': str(merged.get('due_date') or ''),
                'grand_total': stats.get('total_value_baht') or _to_baht(merged.get('grand_total')),
                'payment': str(merged.get('payment') or ''),
                'reference': merged.get('reference') or '',
                **base,
            }
        if cfg.name == 'INC':
            return {
                'document_id': doc_id,
                **base,
                'po_ref': _pick(merged.get('po_ref'), merged.get('reference')),
                'po_id': str(_pick(merged.get('po_id'), merged.get('reference_id'))),
                'supplier_name': _pick(merged.get('organization'), merged.get('name')),
            }
        return {idf: doc_id, **base}

    def _normalize_line(self, row: dict) -> dict:
        cfg = self.cfg
        doc_id = str(row.get('doc_id') or '')
        idf = cfg.id_field
        line = {
            'line_no': int(row.get('line_no') or 0),
            'doc_ref': row.get('doc_ref') or self._format_doc_ref({
                'title': row.get('title'),
                'document_number': row.get('doc_number'),
            }, cfg),
            'document_number': str(row.get('doc_number') or ''),
            'date': str(row.get('date') or ''),
            'department': row.get('department') or '',
            'project': row.get('project') or '',
            'warehouse': row.get('warehouse_line') or row.get('warehouse') or '',
            'product_id': row.get('product_id') or '',
            'product_name': row.get('product_name') or '',
            'category_code': row.get('category_code') or _product_category(str(row.get('product_id') or '')),
            'quantity': row.get('quantity', 0),
            'unit': row.get('unit') or '',
            'unit_cost_baht': row.get('unit_cost_baht', _to_baht(row.get('price_raw'))),
            'line_total_baht': row.get('line_total_baht', _to_baht(row.get('item_total_raw'))),
            'price_raw': row.get('price_raw', ''),
            'item_total_raw': row.get('item_total_raw', ''),
            'remark': row.get('remark') or '',
            'serial': row.get('serial') or '',
            'acc_code': row.get('acc_code') or '',
            'coefficient': str(row.get('coefficient') or '1'),
            'line_status': row.get('line_status') or '',
            'mrd_id': row.get('mrd_id') or '',
            'mr_item_id': row.get('mr_item_id') or '',
            'po_item_id': row.get('po_item_id') or '',
            'item_id': row.get('item_id') or '',
            'weight': row.get('weight') or '',
            'source_created_at': str(row.get('source_created_at') or ''),
            'source_updated_at': str(row.get('source_updated_at') or ''),
        }
        if cfg.name == 'GR':
            line['receive_id'] = doc_id
            line['supplier_name'] = row.get('name') or ''
        elif cfg.name == 'MR':
            line['mr_id'] = doc_id
            line['request_by'] = row.get('request_by') or ''
            line['purpose'] = row.get('purpose') or ''
        elif cfg.name == 'PO':
            line['po_id'] = doc_id
            line['po_ref'] = line['doc_ref']
        elif cfg.name == 'INC':
            line['document_id'] = doc_id
            line['po_ref'] = row.get('po_ref') or ''
            line['po_id'] = row.get('po_id') or ''
            line['organization'] = row.get('organization') or row.get('name') or ''
        line[idf] = doc_id
        return line

    @staticmethod
    def _aggregate_lines(items: list, idf: str) -> dict[str, dict]:
        """สรุปสถิติต่อเอกสารจากรายการ line"""
        by_doc: dict[str, dict] = {}
        for row in items:
            doc_id = str(row.get('doc_id') or row.get(idf) or '')
            if not doc_id:
                continue
            bucket = by_doc.setdefault(doc_id, {
                'line_count': 0,
                'sum_quantity': 0.0,
                'total_value_baht': 0.0,
                'skus': set(),
                'product_names': [],
                'sku_agg': {},
            })
            bucket['line_count'] += 1
            qty = _to_number(row.get('quantity'))
            bucket['sum_quantity'] += qty
            bucket['total_value_baht'] = round(
                bucket['total_value_baht'] + _to_number(row.get('line_total_baht')),
                4,
            )
            pid = str(row.get('product_id') or '')
            pname = str(row.get('product_name') or '')
            if pid:
                bucket['skus'].add(pid)
            if pname:
                bucket['product_names'].append(pname)
                agg = bucket['sku_agg'].setdefault(pid or pname, {
                    'product_id': pid,
                    'product_name': pname,
                    'quantity': 0.0,
                    'total_baht': 0.0,
                })
                agg['quantity'] += qty
                agg['total_baht'] = round(agg['total_baht'] + _to_number(row.get('line_total_baht')), 4)

        out = {}
        for doc_id, b in by_doc.items():
            out[doc_id] = {
                'line_count': b['line_count'],
                'sum_quantity': round(b['sum_quantity'], 4),
                'total_value_baht': round(b['total_value_baht'], 2),
                'unique_skus': len(b['skus']),
                'product_names': b['product_names'],
                'product_summary': list(b['sku_agg'].values()),
            }
        return out

    @staticmethod
    def _build_product_index(lines: list) -> list:
        idx: dict[str, dict] = {}
        for ln in lines:
            pid = str(ln.get('product_id') or '')
            if not pid:
                continue
            ent = idx.setdefault(pid, {
                'product_id': pid,
                'product_name': ln.get('product_name') or '',
                'category_code': ln.get('category_code') or '',
                'unit': ln.get('unit') or '',
                'last_unit_cost_baht': ln.get('unit_cost_baht', 0),
                'line_count': 0,
                'total_qty': 0.0,
            })
            ent['line_count'] += 1
            ent['total_qty'] += _to_number(ln.get('quantity'))
            if ln.get('unit_cost_baht'):
                ent['last_unit_cost_baht'] = ln.get('unit_cost_baht')
            if ln.get('product_name'):
                ent['product_name'] = ln.get('product_name')
        return sorted(idx.values(), key=lambda x: x['product_id'])

    def build_json_payload(self, records: list, items: list,
                           date_from: str, date_to: str,
                           detail_heads: Optional[dict] = None,
                           company_id: str = '',
                           project_filter: str = '') -> dict:
        idf = self.cfg.id_field
        raw_stats = self._aggregate_lines(items, idf)
        lines = [self._normalize_line(row) for row in items]

        orders = []
        for rec in records:
            doc_id = str(rec.get(idf) or rec.get('id') or '')
            orders.append(self._normalize_order(
                rec,
                (detail_heads or {}).get(doc_id),
                raw_stats.get(doc_id),
            ))

        total_baht = round(sum(o.get('total_value_baht', 0) or 0 for o in orders), 2)
        product_index = self._build_product_index(lines)

        payload = {
            'schema_version': JSON_SCHEMA_VERSION,
            'doc_type': self.cfg.name,
            'fetched_at': datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
            'date_from': date_from,
            'date_to': date_to,
            'source': 'trcloud',
            'company_id': company_id,
            'count': len(orders),
            'summary': {
                'order_count': len(orders),
                'line_count': len(lines),
                'total_value_baht': total_baht,
                'unique_products': len(product_index),
            },
            'orders': orders,
            'lines': lines,
            'product_index': product_index,
        }
        if project_filter:
            payload['project_filter'] = project_filter
        return payload

    def export_to_json(self, records: list, items: list, filename: str,
                       date_from: str, date_to: str,
                       detail_heads: Optional[dict] = None,
                       project_filter: str = ''):
        """บันทึก .json — orders + lines + product_index"""
        if not records and not items:
            print(f"⚠️ {self.cfg.name}: ไม่มีข้อมูลสำหรับบันทึก")
            return
        out_dir = os.path.dirname(filename)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        payload = self.build_json_payload(
            records, items, date_from, date_to,
            detail_heads=detail_heads,
            company_id=self.company_id,
            project_filter=project_filter,
        )
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            s = payload['summary']
            print(f"📝 orders: {s['order_count']} · lines: {s['line_count']} · "
                  f"SKU: {s['unique_products']} · รวม ฿{s['total_value_baht']:,.2f}")
            print(f"💾 บันทึก JSON สำเร็จที่: {filename}")
        except Exception as e:
            print(f"❌ บันทึกไม่ได้: {e}")

    # ------------------------------------------
    # Export (legacy Excel — ต้องมี pandas)
    # ------------------------------------------
    def export_to_excel(self, records: list, items: list, filename: str):
        """บันทึก .xlsx — ชีต <NAME>_List + <NAME>_Items ในไฟล์เดียว"""
        try:
            import pandas as pd
        except ImportError:
            print("⚠️ ต้องติดตั้ง pandas + openpyxl สำหรับ Excel: pip install pandas openpyxl")
            return
        if not records and not items:
            print(f"⚠️ {self.cfg.name}: ไม่มีข้อมูลสำหรับบันทึก")
            return
        out_dir = os.path.dirname(filename)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        try:
            with pd.ExcelWriter(filename, engine='openpyxl') as writer:
                if records:
                    df = pd.DataFrame(_clean_records(records))
                    df.to_excel(writer, sheet_name=f'{self.cfg.name}_List', index=False)
                    print(f"📝 {self.cfg.name}_List: {len(df)} rows")
                if items:
                    df_items = pd.DataFrame(items)
                    lead = ['doc_item', 'doc_number', 'title', 'date', 'status',
                            'product_id', 'product', 'quantity', 'price', 'total',
                            'warehouse', 'remark']
                    ordered = [c for c in lead if c in df_items.columns] + \
                              [c for c in df_items.columns if c not in lead]
                    df_items[ordered].to_excel(writer, sheet_name=f'{self.cfg.name}_Items', index=False)
                    print(f"📝 {self.cfg.name}_Items: {len(df_items)} rows")
            print(f"💾 บันทึกสำเร็จที่: {filename}")
        except Exception as e:
            print(f"❌ บันทึกไม่ได้: {e}")


def run_cli(cfg: DocConfig, default_company_id: str, default_passkey: str,
            default_cookie: str, default_output: str,
            date_from: str, date_to: str, project_filter: str = ""):
    """ตัวช่วยรัน CLI ให้สคริปต์แต่ละชนิดเรียกใช้ซ้ำได้"""
    import argparse

    parser = argparse.ArgumentParser(description=f'TRCloud {cfg.name} extractor')
    parser.add_argument('--company-id', default=default_company_id)
    parser.add_argument('--passkey', default=default_passkey)
    parser.add_argument('--from', dest='date_from', default=date_from)
    parser.add_argument('--to', dest='date_to', default=date_to)
    parser.add_argument('--cookie', default=default_cookie)
    parser.add_argument('--keyword', default='')
    parser.add_argument('--status', default='')
    parser.add_argument('--project-filter', default=project_filter,
                        help='กรองเฉพาะโครงการที่ขึ้นต้นด้วยค่านี้ เช่น TN')
    parser.add_argument('--no-details', dest='with_details', action='store_false',
                        help='เอาเฉพาะ List ไม่ดึงรายการสินค้า')
    parser.set_defaults(with_details=True)
    parser.add_argument('--sleep', type=float, default=0.0,
                        help='หน่วง (วินาที) ระหว่าง detail requests')
    parser.add_argument('--format', choices=['json', 'xlsx'], default='json',
                        help='รูปแบบไฟล์ผลลัพธ์ (default: json)')
    parser.add_argument('--output', default=default_output,
                        help='path ไฟล์ผลลัพธ์')
    args = parser.parse_args()

    fetcher = TRCloudICSFetcher(cfg, args.company_id, args.passkey, args.cookie)

    records = fetcher.fetch_list(args.date_from, args.date_to,
                                 keyword=args.keyword, status=args.status)
    records = filter_records_by_project(records, args.project_filter, cfg.name)
    items = []
    detail_heads = {}
    if args.with_details and records:
        items, detail_heads = fetcher.extract_items(records, sleep_between=args.sleep)

    if args.format == 'xlsx':
        out = args.output
        if not out.lower().endswith('.xlsx'):
            out = os.path.splitext(out)[0] + '.xlsx'
        fetcher.export_to_excel(records, items, out)
    else:
        out = args.output
        if not out.lower().endswith('.json'):
            out = os.path.splitext(out)[0] + '.json'
        fetcher.export_to_json(
            records, items, out, args.date_from, args.date_to, detail_heads,
            project_filter=args.project_filter,
        )
