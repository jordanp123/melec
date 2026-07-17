# Mine Electrical Calculation Aid (melec)

A single-file, client-side web app that assists mine electrical inspectors with
cable, conductor, overload, and short-circuit sizing. Everything — markup,
styles, calculation logic, and reference tables — lives in one `index.html`
with no build step, no dependencies, and no network calls, so the page works
identically from a web server, a USB stick, or (via the bundled service
worker) fully offline underground.

> **Disclaimer.** This is a personal **hobby project**, built and maintained
> in spare time. It is provided as-is, with no warranty of any kind and no
> guarantee of accuracy, completeness, or suitability for any purpose.
> Errors, omissions, and miscalculations — while never intended — are
> possible and **should be expected**; do not treat any output as correct
> without independently checking it.
>
> The tool is an *aid* that reproduces standard mine electrical calculation
> methods and published reference tables. It is not all-inclusive and is not
> a substitute for the regulations or for qualified engineering judgment.
> Always verify results against the motor nameplate, the current regulation,
> and manufacturer data before relying on them. See the **About /
> Disclaimer** tab in the app for full sourcing and errata.

## Calculators

| Tab | What it does |
|---|---|
| **Motor Circuit** | Single-motor FLC, conductor sizing, and branch-circuit short-circuit protection: NEC Table 430.52 (incl. the instantaneous-trip column with Design B ranges) for surface, 30 CFR 75.601-1 settings for underground, and NEC 430.122 conductor sizing when the motor is VFD-driven (surface only) |
| **Feeder / Multi-Motor** | NEC 430.24 feeder conductor sizing with per-row VFD input support (430.122(D)), plus feeder short-circuit protection per NEC 430.62 / MSHA's 1968 430-62(a) (round-**down** rule) and underground instantaneous-element settings |
| **Overload / Heater** | NEC 430.32 overload selection and Cutler-Hammer / Westinghouse Type FH heater lookup for starter sizes 00–6 |
| **Trip-Range Helper** | Checks whether an installed device setting falls inside the permitted trip range |
| **Ampacity Tables** | ICEA underground cable ampacities as reproduced in Appendix A of the MSHA Electrical Inspection Procedures Handbook (PH20-V-5), with ambient/derating helpers |
| **Reference Data** | Supporting constants and lookup tables |
| **Ohm's Law** | Quick V / I / R / P solver |
| **About / Disclaimer** | Sources, transcription notes, corrected source-table cells, and an errata log |

Reference tables are transcribed from the published sources as printed. Where
a printed cell is an evident typographical error (five Type-FH heater ranges,
two ICEA ampacity cells), the corrected reading and the evidence for it are
documented on the About tab rather than applied silently.

## Repository layout

| Path | Purpose |
|---|---|
| `index.html` | The entire application (single inline `<script>` and `<style>`) |
| `sw.js` | Network-first service worker: online visitors always get the freshly deployed copy; the last good copy is served from Cache Storage when offline or on a stalled connection |
| `favicon.ico` | Site icon |
| `nginx.conf` | Production server config: security headers, header CSP, GET/HEAD only |
| `Dockerfile` | `nginx-unprivileged:alpine` + the three static files above |
| `docker-compose.yaml` | Hardened two-container stack: the nginx site on an internal-only network, published through a Cloudflare Tunnel (`cloudflared`) |
| `rehash.sh` | Recomputes the CSP `script-src`/`style-src` hashes after any edit to the inline script or style (see below) |
| `tests/` | Node-based assertion suite (~4,500 assertions) — see `tests/README.md` |

## Security model

The page is locked down by a strict Content-Security-Policy delivered twice —
as an nginx response header (authoritative) and as a `<meta>` fallback inside
`index.html` for file/offline use:

- `default-src 'none'`; the inline `<script>` and `<style>` are allowed only
  by their **SHA-256 content hashes**. Any tampering with the calculation
  script means the browser refuses to run it — the gate fails closed, and a
  static red load-error banner (normally torn down by app boot) becomes
  visible instead of a silently wrong calculator.
- No external requests of any kind: `img-src`/`worker-src`/`connect-src` are
  `'self'` only, `base-uri 'none'`, `form-action 'none'`, and the header adds
  `frame-ancestors 'none'`.
- The container runs read-only, unprivileged, with all capabilities dropped,
  and is reachable only through the Cloudflare Tunnel (the `backend` network
  is `internal: true`).

## Editing workflow

Because the CSP pins the inline script and style by hash, **any** edit to the
`<script>` or `<style>` contents of `index.html` breaks the page until the
hashes are recomputed:

```sh
./rehash.sh   # patches BOTH the <meta> CSP in index.html and the header CSP in nginx.conf
```

`rehash.sh` needs only `python3` and is idempotent. If you edit and forget to
run it, the deployed page shows the red "failed integrity check" screen —
that is the mechanism working, not a server problem.

Then run the tests:

```sh
cd tests
node tests.js                        # main suite
ACK_SEED=1 node tests_ack_seeded.js  # acknowledged-session variant
```

Exit code 0 means all assertions passed (suite last run green on Node
v22.11.0). The harness loads the inline script out of `index.html` into a
`vm` context with a DOM stub, so no browser is needed.

## Deployment

```sh
# .env (never committed — see .gitignore):
#   TUNNEL_TOKEN=<cloudflare tunnel token>
docker compose up -d --build
```

nginx serves on port 8080 inside the isolated `backend` network;
`cloudflared` connects outbound to Cloudflare and publishes the site — no
inbound ports are exposed on the host. Responses are `Cache-Control:
no-cache` (always revalidate) so a deployed fix is picked up immediately;
offline availability is the service worker's job, not the HTTP cache's.
