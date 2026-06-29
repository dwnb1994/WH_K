import os
import re
import sys
import html
import json
import time
import argparse
import requests
import pandas as pd
from typing import Optional
from datetime import datetime

from trcloud_auth import get_cookie_for_company

# บังคับ console ให้เป็น UTF-8 (กัน UnicodeEncodeError จากภาษาไทย/emoji บน Windows cp1252)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ============================================================
# ⚙️  ตั้งค่าหลัก — แก้ตรงนี้ได้เลย
# ============================================================
DATE_FROM = "2025-01-01"
DATE_TO   = "2026-06-30"

COMPANY_ID = "14"
PASSKEY    = os.getenv("TRCLOUD_PASSKEY", "")

# passkey ของบริษัทเดิม (25) ที่ใช้ตอน switch — ไม่ใช้ยิง API
_ORIGIN_PASSKEY = os.getenv("TRCLOUD_ORIGIN_PASSKEY", "")

DEFAULT_RAW_COOKIE = get_cookie_for_company(COMPANY_ID, origin_passkey=_ORIGIN_PASSKEY)

OUTPUT_DIR = r"D:\Users\jacki\OneDrive\Desktop\MWM1"
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


class TRCloudBillFetcher:
    """
    ดึงข้อมูล 'ใบวางบิล' (bill.php) จาก TRCloud
    """

    PAGE_SIZE = 50

    def __init__(self, company_id: str, passkey: str, raw_cookie: str):
        self.company_id = company_id
        self.passkey = passkey
        self.base_url = "https://thaidrill.trcloud.co"

        base_api = f"{self.base_url}/application/bill/api/engine-bill"
        self.list_url     = f"{base_api}/bill_search_keyword.php"
        self.detail_url   = f"{base_api}/retrieve_bill.php"

        # Endpoints เสริม
        self.analysis_url = f"{base_api}/analysis_from_keyword.php"
        self.gl_sum_url   = f"{base_api}/gl_summary.php"
        self.gl_det_url   = f"{base_api}/gl_detail.php"
        self.due_url      = f"{base_api}/due-list.php"
        self.payment_url  = f"{base_api}/bill-payment.php"

        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": self.base_url,
            "Referer": f"{self.base_url}/application/bill/bill.php",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Cookie": raw_cookie,
        })
        self.text_cols_to_clean = ['description', 'remark', 'note', 'name', 'organization', 'title']

    # ------------------------------------------
    # Payload builder
    # ------------------------------------------

    def _list_payload(self, date_from: str, date_to: str, **kw) -> dict:
        """Payload สำหรับ Bill Search"""
        return {
            "company_id": self.company_id,
            "passkey": self.passkey,
            "keyword": kw.get("keyword", ""),
            "start": kw.get("start", 0),
            "filter": kw.get("filter", ""),
            "from": kw.get("from_default", date_from),
            "to":   kw.get("to_default",   date_to),
            "activate_date": "on" if kw.get("use_date_filter", True) else "off",
            "department": kw.get("department", ""),
            "sort": kw.get("sort", ""),
            "advance_search": 1 if kw.get("advance_search") else 0,
            "project": kw.get("project", ""),
            "staff": kw.get("staff", ""),
            "source": kw.get("source", ""),
            "title": kw.get("title", ""),
            "name": kw.get("name", ""),
            "organization": kw.get("organization", ""),
            "tax_id": kw.get("tax_id", ""),
            "date_from": date_from,
            "date_to": date_to,
            "doc_from": kw.get("doc_from", ""),
            "doc_to": kw.get("doc_to", ""),
            "total_from": kw.get("total_from", ""),
            "total_to": kw.get("total_to", ""),
            "gtotal_from": kw.get("gtotal_from", ""),
            "gtotal_to": kw.get("gtotal_to", ""),
            "type": kw.get("type", ""),
        }

    # ------------------------------------------
    # List (paginated)
    # ------------------------------------------

    def fetch_list(self, date_from: str, date_to: str, sleep_between: float = 0.3, **kw) -> list:
        """ดึง list ใบวางบิลทั้งหมดในช่วงวันที่"""
        all_records = []
        seen_ids = set()
        start_page = 0
        total = None
        print(f"🚀 เริ่มดึงข้อมูล Bill ({date_from} → {date_to})")

        while True:
            payload = self._list_payload(date_from, date_to, start=start_page, **kw)
            try:
                response = self.session.post(self.list_url, data=payload, timeout=60)
                response.raise_for_status()
                data = response.json()
            except requests.exceptions.RequestException as e:
                print(f"❌ Network Error (Bill) หน้า {start_page}: {e}")
                break
            except json.JSONDecodeError:
                print(f"❌ JSON Decode Error (Bill) หน้า {start_page}")
                print(f"   Response preview: {response.text[:300]}")
                break

            if data.get("success") != 1:
                print(f"❌ API Error (Bill): {data.get('message', 'Unknown Error')}")
                break

            results = data.get("result", []) or []
            if total is None:
                total = int(data.get("count", 0) or 0)
                print(f"📊 มีเอกสาร Bill ทั้งหมด (ตาม filter): {total} รายการ")

            if not results:
                print(f"ℹ️  Bill หน้า {start_page} — ไม่มีข้อมูล (หยุด)")
                break

            # TRCloud อาจคืน bill_id หรือ id ขึ้นอยู่กับ version
            new_rows = [r for r in results if (r.get("bill_id") or r.get("id")) not in seen_ids]
            for r in new_rows:
                seen_ids.add(r.get("bill_id") or r.get("id"))
            all_records.extend(new_rows)

            pct = (len(all_records) / total * 100) if total else 0
            print(f"✅ Bill หน้า {start_page} | got {len(results)} | new {len(new_rows)} | "
                  f"accumulated {len(all_records)}/{total} ({pct:.1f}%)")

            if total and len(all_records) >= total:
                break
            if not new_rows:
                print(f"ℹ️  Bill หน้า {start_page} — ไม่มีรายการใหม่ (หยุด)")
                break

            start_page += 1
            if sleep_between:
                time.sleep(sleep_between)

        print(f"🎉 Bill เสร็จสิ้น ได้ {len(all_records)} รายการ")
        return all_records

    # ------------------------------------------
    # Detail API Helpers
    # ------------------------------------------

    def _post_json_wrap(self, url: str, payload: dict) -> Optional[dict]:
        """endpoint ที่ใช้ json= wrap สำหรับดึง Detail"""
        form_data = {'json': json.dumps(payload)}
        try:
            response = self.session.post(url, data=form_data, timeout=30)
            response.raise_for_status()
            data = response.json()
            if data.get("success") != 1:
                return None
            return data
        except Exception as e:
            print(f"⚠️ {url.split('/')[-1]} failed: {e}")
            return None

    def fetch_detail(self, bill_id, date_from: str, date_to: str, **kw) -> Optional[dict]:
        """retrieve_bill.php — คืน detail ของ Bill แต่ละใบ"""
        payload = self._list_payload(date_from, date_to, **kw)
        payload["id"] = str(bill_id)
        return self._post_json_wrap(self.detail_url, payload)

    # ------------------------------------------
    # Helpers
    # ------------------------------------------

    def extract_bill_items(self, records: list, date_from: str, date_to: str, sleep_between: float = 0.0) -> list:
        """
        วน fetch_detail() ทุก doc แล้วแตก detail[] ออกเป็น item rows
        """
        item_rows = []
        n = len(records)
        for i, rec in enumerate(records, 1):
            bid = rec.get("bill_id") or rec.get("id")
            if not bid:
                continue

            data = self.fetch_detail(bid, date_from, date_to)
            if not data:
                continue

            head = data.get("head") or {}
            details = data.get("detail") or []
            # TRCloud บาง module ใช้ invoice_number เป็น generic field แม้ไม่ใช่ invoice
            bill_number = (head.get("bill_number") or head.get("invoice_number") or
                           rec.get("bill_number") or rec.get("invoice_number") or "")
            company_format = head.get("company_format") or rec.get("company_format") or ""
            doc_number = f"{company_format}{bill_number}" if company_format else str(bill_number)

            for it in details:
                desc = it.get("description") or ""
                product_id = it.get('product_id') or ''
                item_rows.append({
                    'doc_number':    doc_number,
                    'doc_item':      f"{doc_number} {product_id}".strip(),
                    'bill_number':   bill_number,
                    'bill_id':       bid,
                    'issue_date':    head.get('issue_date')    or rec.get('issue_date'),
                    'due_date':      head.get('due_date')      or rec.get('due_date'),
                    'name':          head.get('name')          or rec.get('name'),
                    'organization':  head.get('organization')  or rec.get('organization'),
                    'tax_id':        head.get('tax_id')        or rec.get('tax_id'),
                    'reference':     head.get('reference')     or rec.get('reference'),
                    'type':          head.get('type')          or rec.get('type'),
                    'source':        head.get('source')        or rec.get('source'),
                    'department':    head.get('department')    or rec.get('department'),
                    'project':       head.get('project')       or rec.get('project'),
                    'salesman':      head.get('salesman')      or rec.get('salesman'),
                    'status':        head.get('status')        or rec.get('status'),
                    'payment':       head.get('payment')       or rec.get('payment'),
                    # สถานะการแปลงเป็นใบกำกับภาษี (เฉพาะ Bill)
                    'convert_status': head.get('convert_status') or rec.get('convert_status'),
                    'invoice_ref':   head.get('invoice_ref')   or rec.get('invoice_ref'),
                    # ----- field ของ item -----
                    'product_id':  product_id,
                    'description': clean_html_text(str(desc)) if desc else '',
                    'unit':        it.get('unit') or it.get('sunit'),
                    'sunit':       it.get('sunit'),
                    'quantity':    it.get('quantity'),
                    'price':       it.get('price'),
                    'discount':    it.get('discount'),
                    'before_vat':  it.get('before_vat'),
                    'vat':         it.get('vat'),
                    'item_total':  it.get('total'),
                    'coefficient': it.get('coefficient'),
                    'serial':      it.get('serial'),
                    'anchor':      it.get('anchor'),
                    'acc_code':    it.get('acc_code'),
                    'item_id':     it.get('item_id'),
                    'bill_item_id': it.get('bill_item_id'),
                })

            if i % 20 == 0 or i == n:
                print(f"   📥 detail {i}/{n} ({len(item_rows)} item rows)")
            if sleep_between:
                time.sleep(sleep_between)

        return item_rows

    def format_dataframe(self, data: list) -> list:
        if not data:
            return []
        priority_cols = [
            'doc_number', 'company_format', 'bill_number', 'invoice_number',
            'issue_date', 'due_date', 'reference',
            'name', 'organization', 'tax_id',
            'total', 'grand_total', 'discount', 'tax', 'wht',
            'status', 'payment', 'type',
            'convert_status', 'invoice_ref',
            'department', 'project', 'staff', 'source',
            'tax_report', 'approve_status',
            'description', 'remark', 'note',
            'bill_id', 'company_id',
        ]
        formatted = []
        for row in data:
            new_row = row.copy()
            for col in self.text_cols_to_clean:
                if new_row.get(col) is not None:
                    new_row[col] = clean_html_text(str(new_row[col]))
            cf = str(new_row.get("company_format", "") or "")
            bn = str(new_row.get("bill_number") or new_row.get("invoice_number") or "")
            new_row["doc_number"] = (cf + bn) if cf else bn
            ordered = {c: new_row[c] for c in priority_cols if c in new_row}
            for c in new_row:
                if c not in ordered:
                    ordered[c] = new_row[c]
            formatted.append(ordered)
        return formatted

    # ------------------------------------------
    # Export
    # ------------------------------------------

    def export_to_excel(self, records: list, items: list, filename: str):
        """บันทึกเป็นไฟล์ Excel (.xlsx) — ชีต Bill_List + Bill_Items ในไฟล์เดียว"""
        if not records and not items:
            print("⚠️ ไม่มีข้อมูลสำหรับบันทึก")
            return

        out_dir = os.path.dirname(filename)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        try:
            with pd.ExcelWriter(filename, engine='openpyxl') as writer:
                formatted = self.format_dataframe(records)
                if formatted:
                    pd.DataFrame(formatted).to_excel(writer, sheet_name='Bill_List', index=False)
                    print(f"📝 Bill_List: {len(formatted)} rows")

                if items:
                    item_priority = [
                        'doc_item', 'doc_number', 'bill_number', 'issue_date', 'due_date',
                        'organization', 'name', 'product_id', 'description',
                        'unit', 'sunit', 'quantity', 'price', 'discount', 'before_vat', 'vat', 'item_total',
                        'coefficient', 'serial', 'anchor',
                        'acc_code', 'salesman', 'status', 'payment', 'type',
                        'convert_status', 'invoice_ref',
                        'department', 'project',
                        'bill_id', 'item_id', 'bill_item_id',
                    ]
                    df_items = pd.DataFrame(items)
                    ordered = [c for c in item_priority if c in df_items.columns] + \
                              [c for c in df_items.columns if c not in item_priority]
                    df_items[ordered].to_excel(writer, sheet_name='Bill_Items', index=False)
                    print(f"📝 Bill_Items: {len(items)} rows")

            print(f"💾 บันทึกสำเร็จที่: {filename}")
        except Exception as e:
            print(f"❌ บันทึกไม่ได้: {e}")

    def export_to_csv(self, records: list, items: list, filename: str):
        """บันทึกเป็น CSV (UTF-8-SIG)"""
        if not records and not items:
            print("⚠️ ไม่มีข้อมูลสำหรับบันทึก")
            return

        base, _ = os.path.splitext(filename)
        out_dir = os.path.dirname(filename)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        try:
            formatted = self.format_dataframe(records)
            if formatted:
                list_path = f"{base}_List.csv"
                pd.DataFrame(formatted).to_csv(list_path, index=False, encoding='utf-8-sig')
                print(f"📝 Bill_List: {len(formatted)} rows → {list_path}")

            if items:
                item_priority = [
                    'doc_item', 'doc_number', 'bill_number', 'issue_date', 'due_date',
                    'organization', 'name', 'product_id', 'description',
                    'unit', 'sunit', 'quantity', 'price', 'discount', 'before_vat', 'vat', 'item_total',
                    'coefficient', 'serial', 'anchor',
                    'acc_code', 'salesman', 'status', 'payment', 'type',
                    'convert_status', 'invoice_ref',
                    'department', 'project',
                    'bill_id', 'item_id', 'bill_item_id',
                ]
                df_items = pd.DataFrame(items)
                ordered = [c for c in item_priority if c in df_items.columns] + \
                          [c for c in df_items.columns if c not in item_priority]
                items_path = f"{base}_Items.csv"
                df_items[ordered].to_csv(items_path, index=False, encoding='utf-8-sig')
                print(f"📝 Bill_Items: {len(items)} rows → {items_path}")

            print(f"💾 บันทึกสำเร็จที่: {out_dir or '.'}")
        except Exception as e:
            print(f"❌ บันทึกไม่ได้: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='TRCloud Bill (ใบวางบิล) extractor')
    parser.add_argument('--company-id', default=COMPANY_ID)
    parser.add_argument('--passkey', default=PASSKEY)
    parser.add_argument('--from', dest='date_from', default=DATE_FROM)
    parser.add_argument('--to',   dest='date_to',   default=DATE_TO)
    parser.add_argument('--cookie', default=DEFAULT_RAW_COOKIE)
    parser.add_argument('--keyword', default='')
    parser.add_argument('--project', default='')
    parser.add_argument('--department', default='')
    parser.add_argument('--staff', default='')
    parser.add_argument('--source', default='')
    parser.add_argument('--type', default='', help='ประเภทเอกสาร เช่น project')
    parser.add_argument('--no-details', dest='with_details', action='store_false',
                        help='ไม่ต้องดึงรายการสินค้า (เอาเฉพาะ Bill_List)')
    parser.set_defaults(with_details=True)
    parser.add_argument('--sleep', type=float, default=0.0,
                        help='หน่วง (วินาที) ระหว่าง detail requests')
    _default_output = os.path.join(OUTPUT_DIR, f"TRCloud_Bill_{datetime.now():%Y%m%d_%H%M%S}.xlsx")
    parser.add_argument('--output', default=_default_output)
    args = parser.parse_args()

    fetcher = TRCloudBillFetcher(args.company_id, args.passkey, args.cookie)

    list_kwargs = {
        'keyword':    args.keyword,
        'project':    args.project,
        'department': args.department,
        'staff':      args.staff,
        'source':     args.source,
        'type':       args.type,
    }

    # 1. ดึงข้อมูลรายชื่อ Bill ทั้งหมด
    records = fetcher.fetch_list(args.date_from, args.date_to, **list_kwargs)

    # 2. ดึง Detail รายการสินค้าด้านใน
    items = []
    if args.with_details and records:
        items = fetcher.extract_bill_items(records, args.date_from, args.date_to, sleep_between=args.sleep)

    # 3. Export เป็น Excel
    fetcher.export_to_excel(records, items, args.output)
