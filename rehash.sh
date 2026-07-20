#!/usr/bin/env bash
# rehash.sh — recompute or verify the CSP content hashes the site depends on.
#
# Usage:
#   ./rehash.sh          patch the hashes after ANY edit to the inline <script>
#                        or <style> in index.html (and after CSP edits in
#                        nginx.conf)
#   ./rehash.sh --check  verify only, no writes: hashes fresh in all four slots
#                        AND the two CSPs in lockstep — nonzero exit on any
#                        mismatch (suitable as a pre-commit/CI gate)
#
# What it does:
#   sha256 of the inline <script> and <style> char-data -> CSP script-src /
#   style-src, patched into BOTH index.html (the <meta> CSP) AND nginx.conf (the
#   response-header CSP), keeping the two in lockstep. It refuses to run if the
#   file layout breaks its assumptions (must be exactly one attribute-less
#   <script> and <style>), asserts every patch actually landed instead of
#   claiming success blindly, and verifies the two CSPs are identical apart
#   from the header-only frame-ancestors directive.
#
# The whole-file SHA-512 self-integrity check that used to live here was REMOVED
# (2026-07): it added no protection the CSP script-src 'sha256-' hash doesn't
# already give (that hash fails CLOSED — an altered calculation script won't
# execute), and it could not work behind Cloudflare, which appends a
# per-request bot-management script to the served page. So there is no
# <meta name="integrity-sha512"> to maintain any more, and this script only
# touches the two CSP hashes.
#
# Requires python3 (present; no node needed). Idempotent: re-running with no
# source change reproduces the same two hashes.
set -euo pipefail
cd "$(dirname "$0")"

python3 - "$@" <<'PY'
import re, sys, hashlib, base64, pathlib

check_only = "--check" in sys.argv[1:]

html_path  = pathlib.Path("index.html")
nginx_path = pathlib.Path("nginx.conf")

# Binary IO throughout so no newline/charset translation can shift a byte:
# the browser hashes the raw UTF-8 response, so we must too.
html  = html_path.read_bytes().decode("utf-8")
nginx = nginx_path.read_bytes().decode("utf-8")

def die(msg):
    print("rehash.sh: FAIL — %s" % msg, file=sys.stderr)
    sys.exit(1)

# inner() hashes everything between the FIRST bare <tag> and its </tag>. That
# is only correct while index.html has exactly one of each, with no attributes
# — so refuse to continue the moment that stops being true, instead of
# silently hashing the wrong bytes.
for tag in ("script", "style"):
    n = html.count("<" + tag)
    if n != 1:
        die("expected exactly one <%s in index.html, found %d — a second tag "
            "(or the literal text) would make the hash cover the wrong bytes" % (tag, n))
    if "<%s>" % tag not in html:
        die("the single <%s ...> tag has attributes — the extraction below "
            "can no longer find it" % tag)

def inner(tag, s):
    """Exact char-data the browser feeds to the CSP hash: everything between
    the first <tag> and its </tag>."""
    o = "<%s>" % tag
    i = s.index(o) + len(o)
    j = s.index("</%s>" % tag, i)
    return s[i:j]

def sha256_b64(text):
    return base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode("ascii")

script_hash = sha256_b64(inner("script", html))
style_hash  = sha256_b64(inner("style",  html))

# The +-quantifier means the empty literal 'sha256-' that appears in a script
# comment can never match — only real hash tokens are touched.
PATS = (("script", r"script-src 'sha256-[A-Za-z0-9+/=]+'", "script-src 'sha256-%s'" % script_hash),
        ("style",  r"style-src 'sha256-[A-Za-z0-9+/=]+'",  "style-src 'sha256-%s'"  % style_hash))

def patch(name, s):
    for kind, pat, new in PATS:
        s, n = re.subn(pat, new, s)
        if n != 1:
            die("%s: expected exactly one %s-src hash token to patch, matched %d "
                "— the CSP was reformatted and this script no longer fits it" % (name, kind, n))
    return s

def csp_lockstep(html_s, nginx_s):
    """The two CSPs must be identical apart from frame-ancestors, which only
    works as a response header (browsers ignore it in a <meta> CSP)."""
    m = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]*)"', html_s)
    h = re.search(r'add_header Content-Security-Policy "([^"]*)" always;', nginx_s)
    if not m or not h:
        die("could not locate the meta CSP and/or the header CSP to compare")
    meta_csp, header_csp = m.group(1), h.group(1)
    if "frame-ancestors" in meta_csp:
        die("meta CSP contains frame-ancestors — browsers ignore it there; it belongs in nginx.conf only")
    if "frame-ancestors 'none'" not in header_csp:
        die("header CSP lost frame-ancestors 'none'")
    if header_csp.replace("; frame-ancestors 'none'", "", 1) != meta_csp:
        die("meta CSP and header CSP have drifted apart (beyond the header-only "
            "frame-ancestors) — every non-hash directive must be edited in BOTH files")

if check_only:
    for name, s in (("index.html", html), ("nginx.conf", nginx)):
        for kind, pat, new in PATS:
            found = re.findall(pat, s)
            if len(found) != 1:
                die("%s: expected exactly one %s-src hash token, found %d" % (name, kind, len(found)))
            if found[0] != new:
                die("%s: %s-src hash is STALE (run ./rehash.sh)" % (name, kind))
    csp_lockstep(html, nginx)
    print("script-src sha256 : %s" % script_hash)
    print("style-src  sha256 : %s" % style_hash)
    print("OK: hashes fresh in all four slots; meta and header CSPs in lockstep.")
else:
    new_html  = patch("index.html", html)
    new_nginx = patch("nginx.conf", nginx)
    csp_lockstep(new_html, new_nginx)
    html_path.write_bytes(new_html.encode("utf-8"))
    nginx_path.write_bytes(new_nginx.encode("utf-8"))
    print("script-src sha256 : %s" % script_hash)
    print("style-src  sha256 : %s" % style_hash)
    print("Patched: index.html (meta CSP), nginx.conf (header CSP).")
PY
