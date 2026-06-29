import os
# -*- coding: utf-8 -*-
"""
TRCloud MR — ใบเบิกสินค้า/วัตถุดิบ (Material Request)
====================================================
List   : /application/ics/api/engine-ics/search_mr.php
Detail : /application/ics/api/engine-ics/retrieve_mr.php   → {head, body, gl, ...}
id     : mr_id   |   title: "MR"
(ยืนยันจาก reverse-engineering ใน K_Wscr_info.txt)
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

MR_CONFIG = DocConfig(
    name="MR",
    list_path="/application/ics/api/engine-ics/search_mr.php",
    detail_path="/application/ics/api/engine-ics/retrieve_mr.php",
    id_field="mr_id",
    referer="/application/ics/material_request.php",
)


if __name__ == "__main__":
    cookie = get_cookie_for_company(COMPANY_ID, origin_passkey=_ORIGIN_PASSKEY)
    run_cli(MR_CONFIG, COMPANY_ID, PASSKEY, cookie, OUTPUT_DIR, DATE_FROM, DATE_TO)
