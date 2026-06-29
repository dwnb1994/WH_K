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
import pandas as pd
from typing import Optional
from dataclasses import dataclass, field

# บังคับ console ให้เป็น UTF-8 (กัน UnicodeEncodeError จากภาษาไทย/emoji บน Windows cp1252)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_URL = "https://thaidrill.trcloud.co"


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

    def extract_items(self, records: list, sleep_between: float = 0.0) -> list:
        """
        วน fetch_detail() ทุก doc แล้วแตก body[] (รายการสินค้า) ออกเป็น item rows
        เก็บทุก field ของ item + field สำคัญจาก header (generic เพื่อรองรับทุกชนิด)
        """
        item_rows = []
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
            body = data.get("body") or data.get("detail") or []

            doc_number = (head.get("document_number") or rec.get("document_number") or
                          head.get("doc_number") or rec.get("doc_number") or "")
            title = head.get("title") or rec.get("title") or self.cfg.name

            # field ระดับหัวเอกสาร ที่ผูกกับทุก item
            head_ctx = {
                'doc_id':          doc_id,
                'doc_number':      doc_number,
                'title':           title,
                'date':            (head.get('date') or head.get('issue_date') or head.get('order_date')
                                    or rec.get('date') or rec.get('issue_date') or rec.get('order_date')),
                'status':          head.get('status')      or rec.get('status'),
                'request_by':      head.get('request_by')  or rec.get('request_by'),
                'purpose':         clean_html_text(str(head.get('purpose') or rec.get('purpose') or '')),
                'name':            head.get('name') or head.get('client_name') or rec.get('name'),
                'telephone':       head.get('telephone') or head.get('client_telephone') or rec.get('telephone'),
                'department':      head.get('department')  or rec.get('department'),
                'project':         head.get('project')     or rec.get('project'),
                'warehouse':       head.get('warehouse')   or rec.get('warehouse'),
                'reference':       head.get('reference') or head.get('source') or rec.get('source'),
                'create_by':       head.get('create_by')   or rec.get('create_by'),
                'approve_status':  head.get('approve_status') or rec.get('approve_status'),
                'stage':           head.get('stage')       or rec.get('stage'),
            }

            for it in (body or []):
                row = dict(head_ctx)
                product_id = it.get('product_id') or it.get('product_code') or ''
                row['doc_item'] = f"{doc_number} {product_id}".strip()
                # เก็บทุก field ของ item แบบ generic (รองรับ field ต่างกันแต่ละชนิด)
                for k, v in it.items():
                    if isinstance(v, str) and ('<' in v or '&' in v):
                        v = clean_html_text(v)
                    row[f"item_{k}" if k in head_ctx else k] = v
                item_rows.append(row)

            if i % 20 == 0 or i == n:
                print(f"   📥 {self.cfg.name} detail {i}/{n} ({len(item_rows)} item rows)")
            if sleep_between:
                time.sleep(sleep_between)

        return item_rows

    # ------------------------------------------
    # Export
    # ------------------------------------------
    @staticmethod
    def _clean_records(records: list) -> list:
        out = []
        for row in records:
            new_row = dict(row)
            for col in _TEXT_COLS_TO_CLEAN:
                if new_row.get(col) is not None:
                    new_row[col] = clean_html_text(str(new_row[col]))
            out.append(new_row)
        return out

    def export_to_excel(self, records: list, items: list, filename: str):
        """บันทึก .xlsx — ชีต <NAME>_List + <NAME>_Items ในไฟล์เดียว"""
        if not records and not items:
            print(f"⚠️ {self.cfg.name}: ไม่มีข้อมูลสำหรับบันทึก")
            return
        out_dir = os.path.dirname(filename)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        try:
            with pd.ExcelWriter(filename, engine='openpyxl') as writer:
                if records:
                    df = pd.DataFrame(self._clean_records(records))
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
            default_cookie: str, output_dir: str,
            date_from: str, date_to: str):
    """ตัวช่วยรัน CLI ให้สคริปต์แต่ละชนิดเรียกใช้ซ้ำได้"""
    import argparse
    from datetime import datetime

    parser = argparse.ArgumentParser(description=f'TRCloud {cfg.name} extractor')
    parser.add_argument('--company-id', default=default_company_id)
    parser.add_argument('--passkey', default=default_passkey)
    parser.add_argument('--from', dest='date_from', default=date_from)
    parser.add_argument('--to', dest='date_to', default=date_to)
    parser.add_argument('--cookie', default=default_cookie)
    parser.add_argument('--keyword', default='')
    parser.add_argument('--status', default='')
    parser.add_argument('--no-details', dest='with_details', action='store_false',
                        help='เอาเฉพาะ List ไม่ดึงรายการสินค้า')
    parser.set_defaults(with_details=True)
    parser.add_argument('--sleep', type=float, default=0.0,
                        help='หน่วง (วินาที) ระหว่าง detail requests')
    _default_output = os.path.join(
        output_dir, f"TRCloud_{cfg.name}_{datetime.now():%Y%m%d_%H%M%S}.xlsx")
    parser.add_argument('--output', default=_default_output)
    args = parser.parse_args()

    fetcher = TRCloudICSFetcher(cfg, args.company_id, args.passkey, args.cookie)

    records = fetcher.fetch_list(args.date_from, args.date_to,
                                 keyword=args.keyword, status=args.status)
    items = []
    if args.with_details and records:
        items = fetcher.extract_items(records, sleep_between=args.sleep)

    fetcher.export_to_excel(records, items, args.output)
