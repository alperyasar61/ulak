#!/usr/bin/env python3
"""KodMercek safe Android settings migration helper.

Default behavior is audit/backup only. Use --apply after reviewing the generated
JSON report to write the small allow-list of user-facing settings to the target.
This script never copies boot, vendor, framework, kernel, build identity, cache,
or device calibration partitions.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

SAFE_KEYS: dict[str, tuple[str, ...]] = {
    "system": (
        "screen_brightness", "screen_brightness_mode", "screen_off_timeout",
        "accelerometer_rotation", "user_rotation", "font_scale",
        "haptic_feedback_enabled", "sound_effects_enabled", "dtmf_tone",
        "lockscreen_sounds_enabled", "notification_sound", "ringtone", "alarm_alert",
    ),
    "global": (
        "window_animation_scale", "transition_animation_scale", "animator_duration_scale",
        "stay_on_while_plugged_in", "auto_time", "auto_time_zone",
    ),
    "secure": (
        "accessibility_enabled", "enabled_accessibility_services", "high_text_contrast_enabled",
        "accessibility_display_magnification_enabled", "show_ime_with_hard_keyboard",
    ),
}
UNSAFE_WORDS = ("boot", "vendor", "kernel", "persist", "vbmeta", "modem", "efs", "dalvik", "build.prop")
SAFE_VALUE = re.compile(r"^[^\x00-\x1f\x7f]{0,2048}$")


def run_adb(adb: str, serial: str, *args: str, check: bool = True) -> str:
    command = [adb, "-s", serial, *args]
    result = subprocess.run(command, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f"ADB başarısız ({' '.join(args)}): {result.stderr.strip() or result.stdout.strip()}")
    return result.stdout.strip()


def get_props(adb: str, serial: str) -> dict[str, str]:
    raw = run_adb(adb, serial, "shell", "getprop")
    props: dict[str, str] = {}
    for line in raw.splitlines():
        match = re.match(r"\[([^]]+)\]: \[([^]]*)\]", line)
        if match:
            props[match.group(1)] = match.group(2)
    return props


def read_setting(adb: str, serial: str, namespace: str, key: str) -> str | None:
    value = run_adb(adb, serial, "shell", "settings", "get", namespace, key, check=False)
    if not value or value in {"null", "<null>"}:
        return None
    return value


def snapshot(adb: str, serial: str) -> dict[str, Any]:
    props = get_props(adb, serial)
    values: dict[str, dict[str, str]] = {}
    for namespace, keys in SAFE_KEYS.items():
        values[namespace] = {}
        for key in keys:
            value = read_setting(adb, serial, namespace, key)
            if value is not None:
                values[namespace][key] = value
    packages = run_adb(adb, serial, "shell", "pm", "list", "packages", "-3", check=False).splitlines()
    return {
        "serial": serial,
        "model": props.get("ro.product.model", "unknown"),
        "manufacturer": props.get("ro.product.manufacturer", "unknown"),
        "android": props.get("ro.build.version.release", "unknown"),
        "sdk": props.get("ro.build.version.sdk", "unknown"),
        "abi": props.get("ro.product.cpu.abi", "unknown"),
        "safe_settings": values,
        "third_party_packages": sorted(p.removeprefix("package:") for p in packages if p.startswith("package:")),
    }


def connected(adb: str) -> list[str]:
    result = subprocess.run([adb, "devices"], text=True, capture_output=True, check=True)
    return [line.split("\t", 1)[0] for line in result.stdout.splitlines() if "\tdevice" in line]


def compare(source: dict[str, Any], target: dict[str, Any]) -> list[dict[str, str]]:
    plan: list[dict[str, str]] = []
    for namespace, values in source["safe_settings"].items():
        for key, value in values.items():
            if not SAFE_VALUE.fullmatch(value):
                plan.append({"namespace": namespace, "key": key, "status": "skip", "reason": "değer biçimi güvenli değil"})
                continue
            current = target["safe_settings"].get(namespace, {}).get(key)
            plan.append({"namespace": namespace, "key": key, "value": value, "current": current or "yok", "status": "change" if current != value else "same", "reason": "izin verilen kullanıcı ayarı"})
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description="KodMercek güvenli Android ayar taşıma yardımcısı")
    parser.add_argument("--source", required=True, help="Eski Android cihazın ADB seri numarası")
    parser.add_argument("--target", required=True, help="Yeni Android cihazın ADB seri numarası")
    parser.add_argument("--backup-dir", default="kodmercek-android-backup", help="Yedek klasörü")
    parser.add_argument("--apply", action="store_true", help="İncelenen güvenli ayarları hedefe uygula")
    parser.add_argument("--yes", action="store_true", help="Uygulama onay sorusunu atla; --apply ile birlikte kullanılır")
    args = parser.parse_args()
    adb = shutil.which("adb")
    if not adb:
        print("HATA: adb PATH içinde bulunamadı. Android platform-tools kurun.", file=sys.stderr)
        return 2
    if args.source == args.target:
        print("HATA: kaynak ve hedef seri numarası aynı olamaz.", file=sys.stderr)
        return 2
    devices = connected(adb)
    missing = [serial for serial in (args.source, args.target) if serial not in devices]
    if missing:
        print(f"HATA: bağlı olmayan cihaz(lar): {', '.join(missing)}", file=sys.stderr)
        print("Önce 'adb devices' ile iki cihazın da 'device' durumunda olduğunu kontrol edin.", file=sys.stderr)
        return 2
    backup = Path(args.backup_dir).resolve()
    backup.mkdir(parents=True, exist_ok=True)
    print(f"Kaynak okunuyor: {args.source}")
    source = snapshot(adb, args.source)
    print(f"Hedef okunuyor: {args.target}")
    target = snapshot(adb, args.target)
    plan = compare(source, target)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report = {"tool": "KodMercek Android Upgrade", "created_at": stamp, "source": source, "target": target, "plan": plan, "policy": {"mode": "allow-list", "writes": args.apply, "excluded": list(UNSAFE_WORDS)}}
    report_path = backup / f"migration-{stamp}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Rapor ve yedek: {report_path}")
    changes = [item for item in plan if item["status"] == "change"]
    print(f"Güvenli ayar: {len(plan)} · Değişecek: {len(changes)} · Atlanan: {sum(item['status'] == 'skip' for item in plan)}")
    if not args.apply:
        print("Deneme modu: hedef cihaza hiçbir ayar yazılmadı. İnceledikten sonra aynı raporla --apply kullanın.")
        return 0
    if not args.yes:
        answer = input("Onay: yalnızca izin listesindeki ayarlar hedefe yazılacak. Devam? [y/N] ").strip().lower()
        if answer not in {"y", "yes", "e", "evet"}:
            print("İptal edildi; hedef cihaza yazılmadı.")
            return 0
    for item in changes:
        run_adb(adb, args.target, "shell", "settings", "put", item["namespace"], item["key"], item["value"])
        print(f"Uygulandı: {item['namespace']}.{item['key']}")
    print("Tamamlandı. Hedef cihazı yeniden başlatmadan önce kamera, dokunmatik, ses ve Wi‑Fi testlerini çalıştırın.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
