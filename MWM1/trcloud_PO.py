import os
# -*- coding: utf-8 -*-
"""
TRCloud PO — ใบสั่งซื้อ (Purchase Order)
========================================
PO อยู่ในโมดูล expense ของ TRCloud (engine-po) — ยืนยันสดจากหน้า /application/expense/po.php
List   : /application/expense/api/engine-po/po_search_keyword.php
Detail : /application/expense/api/engine-po/retrieve_po.php → {head, body/detail, ...}
id     : po_id
"""

from trcloud_auth import get_cookie_for_company
from trcloud_common import DocConfig, run_cli

# ============================================================
# ⚙️  ตั้งค่าหลัก
# ============================================================
DATE_FROM = "2023-01-01"
DATE_TO   = "2026-12-31"

COMPANY_ID = "14"
PASSKEY    = os.getenv("TRCLOUD_PASSKEY", "")
_ORIGIN_PASSKEY = os.getenv("TRCLOUD_ORIGIN_PASSKEY", "")

OUTPUT_DIR = r"D:\Users\jacki\OneDrive\Desktop\MWM1"
# ============================================================

PO_CONFIG = DocConfig(
    name="PO",
    list_path="/application/expense/api/engine-po/po_search_keyword.php",
    detail_path="/application/expense/api/engine-po/retrieve_po.php",
    id_field="po_id",
    referer="/application/expense/po.php",
    list_encoding="form",   # PO list = form-urlencoded (ตระกูล bill/expense)
)


if __name__ == "__main__":
    cookie = get_cookie_for_company(COMPANY_ID, origin_passkey=_ORIGIN_PASSKEY)
    run_cli(PO_CONFIG, COMPANY_ID, PASSKEY, cookie, OUTPUT_DIR, DATE_FROM, DATE_TO)
