# -*- coding: utf-8 -*-
"""
TRCloud POK — ใบสั่งซื้อ (Purchase Order / expense)
===================================================
List   : /application/expense/api/engine-po/po_search_keyword.php
Detail : /application/expense/api/engine-po/retrieve_po.php
id     : po_id

ข้อมูลเป้าหมาย: ครัวสำรองลาว (Company ID 14)
  login บริษัทต้นทาง (25) → switch เข้า 14
"""

import os

from trcloud_auth import get_cookie_for_company
from trcloud_commonK import DocConfig, run_cli
from trcloud_env import env
from trcloud_paths import API_DATA_DIR

# ============================================================
# ⚙️  ตั้งค่าหลัก — ครัว company 14
# ============================================================
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DEFAULT_OUTPUT = os.path.join(API_DATA_DIR, "po.json")

DATE_FROM = "2026-01-01"
DATE_TO   = "2026-06-30"

COMPANY_ID = env("TRCLOUD_COMPANY_ID", "14")
PASSKEY    = env("TRCLOUD_PASSKEY", "")
_ORIGIN_PASSKEY = env("TRCLOUD_ORIGIN_PASSKEY", "")
PROJECT_FILTER = env("TRCLOUD_PROJECT", "TN")
# ============================================================

PO_CONFIG = DocConfig(
    name="PO",
    list_path="/application/expense/api/engine-po/po_search_keyword.php",
    detail_path="/application/expense/api/engine-po/retrieve_po.php",
    id_field="po_id",
    referer="/application/expense/po.php",
    list_encoding="form",
)


if __name__ == "__main__":
    cookie = get_cookie_for_company(COMPANY_ID, origin_passkey=_ORIGIN_PASSKEY)
    run_cli(PO_CONFIG, COMPANY_ID, PASSKEY, cookie, DEFAULT_OUTPUT, DATE_FROM, DATE_TO, PROJECT_FILTER)
