#!/usr/bin/env bash
# rehash.sh — recompute the CSP content hashes the site depends on. Run this after
# ANY edit to the inline <script> or <style> in index.html (and after edits to the
# CSP in nginx.conf).
#
# What it does:
#   sha256 of the inline <script> and <style> char-data -> CSP script-src /
#   style-src, patched into BOTH index.html (the <meta> CSP) AND nginx.conf (the
#   response-header CSP), keeping the two in lockstep.
#
# The whole-file SHA-512 self-integrity check that used to live here was REMOVED
# (2026-07): it added no protection the CSP script-src 'sha256-' hash doesn't
# already give (that hash fails CLOSED — an altered calculation script won't
# execute), and it could not work behind Cloudflare, which rewrites the served
# bytes on every request. So there is no <meta name="integrity-sha512"> to
# maintain any more, and this script only touches the two CSP hashes.
#
# Requires python3 (present; no node needed). Idempotent: re-running with no
# source change reproduces the same two hashes.
set -euo pipefail
cd "$(dirname "$0")"

python3 - <<'PY'
import re, hashlib, base64, pathlib

html_path  = pathlib.Path("index.html")
nginx_path = pathlib.Path("nginx.conf")

# Binary IO throughout so no newline/charset translation can shift a byte:
# the browser hashes the raw UTF-8 response, so we must too.
html = html_path.read_bytes().decode("utf-8")

def inner(tag, s):
    """Exact char-data the browser feeds to the CSP hash: everything between
    the first <tag> and its </tag> (assumes the tag has no attributes, which
    is true for this file's single <script> and <style>)."""
    o = "<%s>" % tag
    i = s.index(o) + len(o)
    j = s.index("</%s>" % tag, i)
    return s[i:j]

def sha256_b64(text):
    return base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode("ascii")

script_hash = sha256_b64(inner("script", html))
style_hash  = sha256_b64(inner("style",  html))

def patch_csp(s):
    s = re.sub(r"script-src 'sha256-[A-Za-z0-9+/=]+'",
               lambda m: "script-src 'sha256-%s'" % script_hash, s)
    s = re.sub(r"style-src 'sha256-[A-Za-z0-9+/=]+'",
               lambda m: "style-src 'sha256-%s'" % style_hash, s)
    return s

html_path.write_bytes(patch_csp(html).encode("utf-8"))
nginx_path.write_bytes(patch_csp(nginx_path.read_bytes().decode("utf-8")).encode("utf-8"))

print("script-src sha256 : %s" % script_hash)
print("style-src  sha256 : %s" % style_hash)
print("Patched: index.html (meta CSP), nginx.conf (header CSP).")
PY
