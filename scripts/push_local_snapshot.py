#!/usr/bin/env python3
"""Push a QuantWatch v1 research snapshot to the Cloudflare Worker.

The bearer token is read only from QUANTWATCH_SYNC_TOKEN. Never place it in
source code, a command history, or a JSON snapshot file.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_ENDPOINT = "https://quantwatch-api.2333333434.workers.dev/api/snapshot"
MAX_ITEMS = 500
VALID_SIGNALS = {"long", "short", "neutral"}


def fail(message: str) -> None:
    print(f"同步失败：{message}", file=sys.stderr)
    raise SystemExit(2)


def as_number(value: Any, field: str, minimum: float | None = None) -> float:
    if isinstance(value, bool):
        fail(f"{field} 不能是布尔值")
    try:
        number = float(value)
    except (TypeError, ValueError):
        fail(f"{field} 必须是数值")
    if number != number or number in (float("inf"), float("-inf")):
        fail(f"{field} 必须是有限数值")
    if minimum is not None and number < minimum:
        fail(f"{field} 不能小于 {minimum}")
    return number


def iso_timestamp(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(f"{field} 必须是非空ISO时间字符串")
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        fail(f"{field} 不是有效ISO时间：{value!r}")
    return value


def normalize_item(raw: Any, generated_at: str) -> dict[str, Any]:
    if not isinstance(raw, dict):
        fail("items 中的每项必须是对象")
    ticker = str(raw.get("ticker", "")).strip()
    name = str(raw.get("name", "")).strip()
    signal = raw.get("signal")
    if not ticker or len(ticker) > 32:
        fail("ticker 必须是1–32个字符")
    if not name or len(name) > 120:
        fail("name 必须是1–120个字符")
    if signal not in VALID_SIGNALS:
        fail("signal 必须是 long、short 或 neutral")
    output: dict[str, Any] = {
        "ticker": ticker,
        "name": name,
        "signal": signal,
        "consensus": as_number(raw.get("consensus"), "consensus"),
        "price": as_number(raw.get("price"), "price", 0),
        "changePct": as_number(raw.get("changePct"), "changePct"),
        "updatedAt": iso_timestamp(raw.get("updatedAt", generated_at), "updatedAt"),
    }
    if not -1 <= output["consensus"] <= 1:
        fail("consensus 必须在 -1 至 1 之间")
    for field in ("atr", "stopLoss", "takeProfit"):
        if raw.get(field) is not None:
            output[field] = as_number(raw[field], field, 0)
    return output


def normalize_snapshot(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        fail("快照JSON根节点必须是对象")
    generated_at = iso_timestamp(raw.get("generatedAt") or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "generatedAt")
    universe = str(raw.get("universe", "")).strip()
    disclaimer = str(raw.get("disclaimer", "")).strip()
    items = raw.get("items")
    if not universe or len(universe) > 160:
        fail("universe 必须是1–160个字符")
    if not disclaimer or len(disclaimer) > 1000:
        fail("disclaimer 必须是1–1000个字符")
    if not isinstance(items, list) or len(items) > MAX_ITEMS:
        fail(f"items 必须是数组且不能超过 {MAX_ITEMS} 项")
    return {
        "version": 1,
        "generatedAt": generated_at,
        "universe": universe,
        "items": [normalize_item(item, generated_at) for item in items],
        "disclaimer": disclaimer,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="向 QuantWatch 云端同步 v1 研究快照")
    parser.add_argument("--input", required=True, type=Path, help="本地量化引擎生成的 v1 快照 JSON 文件")
    parser.add_argument("--endpoint", default=os.getenv("QUANTWATCH_SYNC_ENDPOINT", DEFAULT_ENDPOINT), help="同步端点；默认生产 Worker")
    parser.add_argument("--dry-run", action="store_true", help="只校验并打印结果，不发起网络请求")
    args = parser.parse_args()

    token = os.getenv("QUANTWATCH_SYNC_TOKEN", "").strip()
    if not args.dry_run and not token:
        fail("未设置 QUANTWATCH_SYNC_TOKEN 环境变量")
    try:
        payload = normalize_snapshot(json.loads(args.input.read_text(encoding="utf-8")))
    except OSError as error:
        fail(f"无法读取 {args.input}: {error}")
    except json.JSONDecodeError as error:
        fail(f"JSON 格式错误：{error}")

    if args.dry_run:
        print(json.dumps({"status": "validated", "generatedAt": payload["generatedAt"], "itemCount": len(payload["items"])}, ensure_ascii=False))
        return

    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = Request(args.endpoint, data=body, method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "QuantWatch-LocalSync/1"})
    try:
        with urlopen(request, timeout=20) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            print(response_body)
            if response.status not in (200, 201, 202):
                raise SystemExit(1)
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        fail(f"云端返回 HTTP {error.code}：{detail}")
    except URLError as error:
        fail(f"网络错误：{error.reason}")


if __name__ == "__main__":
    main()
