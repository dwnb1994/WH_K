# -*- coding: utf-8 -*-
"""
TRCloud GR — ใบรับสินค้า (Goods Receive)
========================================
List   : /application/ics/api/engine-receive/search_receive.php
Detail : /application/ics/api/engine-receive/retrieve_receive.php → {head, body, gl, ...}
id     : receive_id   |   title: "GR"   |   create_by: "goods_receive"
(ยืนยันจาก reverse-engineering ใน K_Wscr_info.txt)
"""

import os

from trcloud_auth import get_cookie_for_company
from trcloud_commonK import DocConfig, run_cli

# ============================================================
# ⚙️  ตั้งค่าหลัก
# ============================================================
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_API_DATA = os.path.join(_SCRIPT_DIR, "..", "WH_K", "warehouse-app", "apps", "api", "data")
DATA_DIR = os.path.join(_SCRIPT_DIR, "data")
DEFAULT_OUTPUT = os.path.join(_API_DATA, "gr.json")

DATE_FROM = "2026-01-01"
DATE_TO   = "2026-12-31"

COMPANY_ID = "14"
PASSKEY    = os.getenv("TRCLOUD_PASSKEY", "")
_ORIGIN_PASSKEY = os.getenv("TRCLOUD_ORIGIN_PASSKEY", "")
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
    run_cli(GR_CONFIG, COMPANY_ID, PASSKEY, cookie, DEFAULT_OUTPUT, DATE_FROM, DATE_TO)
