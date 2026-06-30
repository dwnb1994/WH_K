# -*- coding: utf-8 -*-
"""
TRCloud GRK — ใบรับสินค้า (Goods Receive)
==========================================
List   : /application/ics/api/engine-receive/search_receive.php
Detail : /application/ics/api/engine-receive/retrieve_receive.php → {head, body, gl, ...}
id     : receive_id

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
DEFAULT_OUTPUT = os.path.join(API_DATA_DIR, "gr.json")

DATE_FROM = "2026-01-01"
DATE_TO   = "2026-06-30"

COMPANY_ID = env("TRCLOUD_COMPANY_ID", "14")
PASSKEY    = env("TRCLOUD_PASSKEY", "")
_ORIGIN_PASSKEY = env("TRCLOUD_ORIGIN_PASSKEY", "")
PROJECT_FILTER = env("TRCLOUD_PROJECT", "TN")
# ============================================================

GR_CONFIG = DocConfig(
    name="GR",
    list_path="/application/ics/api/engine-receive/search_receive.php",
    detail_path="/application/ics/api/engine-receive/retrieve_receive.php",
    id_field="receive_id",
    referer="/application/ics/receive.php",
)


if __name__ == "__main__":
    cookie = get_cookie_for_company(COMPANY_ID, origin_passkey=_ORIGIN_PASSKEY)
    run_cli(GR_CONFIG, COMPANY_ID, PASSKEY, cookie, DEFAULT_OUTPUT, DATE_FROM, DATE_TO, PROJECT_FILTER)
