#!/usr/bin/env python3
"""Validate Furu's versioned tag and stage signed Android release files."""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tomllib
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    package_version = json.loads(Path("package.json").read_text())["version"]
    tauri_version = json.loads(Path("src-tauri/tauri.conf.json").read_text())["version"]
    rust_version = tomllib.loads(Path("src-tauri/Cargo.toml").read_text())["package"]["version"]
    if len({package_version, tauri_version, rust_version}) != 1:
        parser.error("package.json, tauri.conf.json and Cargo.toml versions differ")
    if not re.fullmatch(rf"v{re.escape(package_version)}(?:-rc\.[1-9][0-9]*)?", args.tag):
        parser.error(f"tag must be v{package_version} or v{package_version}-rc.N")
    ancestry = subprocess.run(["git", "merge-base", "--is-ancestor", "HEAD", "origin/main"], check=False)
    if ancestry.returncode != 0:
        parser.error("signed release tags must point to commits already on main")
    if args.validate_only:
        return

    apks = list(Path("src-tauri/gen/android/app/build/outputs/apk").glob("**/release/*.apk"))
    aabs = list(Path("src-tauri/gen/android/app/build/outputs/bundle").glob("**/*.aab"))
    if len(apks) != 1 or len(aabs) != 1:
        parser.error(f"expected one signed release APK and AAB, found {len(apks)} APKs and {len(aabs)} AABs")
    output = Path("dist")
    output.mkdir(exist_ok=True)
    sums = []
    for source, suffix in ((apks[0], "apk"), (aabs[0], "aab")):
        target = output / f"furu-{args.tag}-android-arm64.{suffix}"
        shutil.copyfile(source, target)
        sums.append(f"{hashlib.sha256(target.read_bytes()).hexdigest()}  {target.name}")
    (output / "SHA256SUMS").write_text("\n".join(sums) + "\n")
    print("\n".join(sums))


if __name__ == "__main__":
    main()
