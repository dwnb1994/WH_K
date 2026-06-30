# -*- coding: utf-8 -*-
"""Shared paths for Kitchen (company 14) extractors."""

import os

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
API_DATA_DIR = os.path.join(
    _SCRIPT_DIR, "..", "SR_APP", "WH_K", "warehouse-app", "apps", "api", "data",
)
