# -*- coding: utf-8 -*-
"""
TRCloud MR — ใบเบิกสินค้า/วัตถุดิบ (Material Request)
====================================================
List   : /application/ics/api/engine-ics/search_mr.php
Detail : /application/ics/api/engine-ics/retrieve_mr.php   → {head, body, gl, ...}
id     : mr_id   |   title: "MR"
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
DEFAULT_OUTPUT = os.path.join(_API_DATA, "mr.json")

DATE_FROM = "2023-01-01"
DATE_TO   = "2026-12-31"

COMPANY_ID = os.getenv("TRCLOUD_COMPANY_ID", "14")
PASSKEY    = os.getenv("TRCLOUD_PASSKEY", "")
_ORIGIN_PASSKEY = os.getenv("TRCLOUD_ORIGIN_PASSKEY", "")
# ============================================================

MR_CONFIG = DocConfig(
    name="MR",
    list_path="/application/ics/api/engine-ics/search_mr.php",
    detail_path="/application/ics/api/engine-ics/retrieve_mr.php",
    id_field="mr_id",
    referer="/application/ics/material_request.php",
)


if __name__ == "__main__":
    cookie = get_cookie_for_company(COMPANY_ID, origin_passkey=_ORIGIN_PASSKEY)
    run_cli(MR_CONFIG, COMPANY_ID, PASSKEY, cookie, DEFAULT_OUTPUT, DATE_FROM, DATE_TO)
