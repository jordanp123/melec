# melec test suite

Node-based assertion suite for `../index.html` (the suite previously lived in
per-session scratchpads under /tmp and was lost between sessions — it now lives
here, excluded from the Docker image via `.dockerignore`).

## Run

```sh
node tests.js                    # main suite (~4400+ assertions)
ACK_SEED=1 node tests_ack_seeded.js   # acknowledged-session variant
```

Exit code 0 = all green. `harness.js` loads the inline `<script>` from
`/home/jordanp123/melec/index.html` (absolute path — adjust if the app moves)
into a `vm` context with a minimal DOM stub, and exposes internals as `api`.

## Status 2026-07-11

Vectors updated for the 430-62 fix set (N1 assumed-rating no-round-up, N2
device-type reset, F1 exact-700% floor + entered-only belowStart, F2 all-frames
trip picks, F3 ugInstUnbounded, F4 single-row table, F6 dead fields removed)
plus DOM coverage for the review-pass fixes (17q). **Not yet executed** — no
node runtime on this host. Every changed/new expected value was cross-validated
against a faithful Python port of the edited functions
(`feeder_port_test.py`, 39/39) and hand arithmetic; run the suite for real the
next time node is available (e.g. `docker run --rm -v "$PWD":/w -w /w/tests
node:20-alpine node tests.js`).
