# -*- coding: utf-8 -*-
"""
TRCloud INC_K — รับสินค้าจาก PO (Cargo / Inbound Cargo)
======================================================
ข้อมูลเป้าหมาย: ครัวสำรองลาว (Company ID 14)
  login บริษัทต้นทาง (25) → switch เข้า 14

List   : /application/ordermgmt_po/api/engine-cargo/cargo_search_keyword.php
Detail : /application/ordermgmt_po/api/engine-cargo/show_detail.php
id     : document_id
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
DEFAULT_OUTPUT = os.path.join(API_DATA_DIR, "inc.json")

DATE_FROM = "2026-01-01"
DATE_TO   = "2026-06-30"

COMPANY_ID = env("TRCLOUD_COMPANY_ID", "14")
PASSKEY    = env("TRCLOUD_PASSKEY", "")
_ORIGIN_PASSKEY = env("TRCLOUD_ORIGIN_PASSKEY", "")
PROJECT_FILTER = env("TRCLOUD_PROJECT", "TN")
# ============================================================

INC_CONFIG = DocConfig(
    name="INC",
    list_path="/application/ordermgmt_po/api/engine-cargo/cargo_search_keyword.php",
    detail_path="/application/ordermgmt_po/api/engine-cargo/show_detail.php",
    id_field="document_id",
    referer="/application/ordermgmt_po/cargo.php",
    list_encoding="form",
)


if __name__ == "__main__":
    cookie = get_cookie_for_company(COMPANY_ID, origin_passkey=_ORIGIN_PASSKEY)
    run_cli(INC_CONFIG, COMPANY_ID, PASSKEY, cookie, DEFAULT_OUTPUT, DATE_FROM, DATE_TO, PROJECT_FILTER)
