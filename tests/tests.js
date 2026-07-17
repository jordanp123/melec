const { api, byId, document, ss } = require("./harness.js");
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra)); }
}
function txt(el) { return el.textContent; }

// ---- 0. app loaded, init runs
api.init();
ok(true, "init() ran without throwing");

// ---- 0b. startup acknowledgment modal
function findAck() { return document.body.children.filter(function (c) { return c.className === "ack-overlay"; }); }
var acks = findAck();
ok(acks.length === 1, "exactly one ack overlay created at init", acks.length);
var ackTxt = acks[0] ? acks[0].textContent : "";
ok(/tool\/aid to help you when working around mine electrical systems/.test(ackTxt), "ack: opening sentence present");
ok(/publicly available federal and state resources/.test(ackTxt), "ack: sources sentence present");
ok(/personal hobby project/.test(ackTxt), "ack: hobby-project framing present");
ok(/no warranty and no guarantee of accuracy, completeness, or suitability/.test(ackTxt), "ack: as-is / no-warranty caveat present");
ok(/Errors and miscalculations should be expected/.test(ackTxt), "ack: errors-expected wording present");
ok(/without independently checking it/.test(ackTxt), "ack: independent-verification wording present");
ok(/GNU General Public License v3/.test(ackTxt), "ack: GPL v3 statement present");
ok(/I acknowledge/.test(ackTxt), "ack: acknowledge button present");
// dialog semantics
var ackBox = acks[0].children[0];
ok(ackBox.attrs.role === "dialog" && ackBox.attrs["aria-modal"] === "true", "ack: role=dialog aria-modal set");
// GPL link present, safe attrs
function findTags(el, tag, out) { out = out || [];
  (el.children || []).forEach(function (c) { if (c.tagName === tag) out.push(c); findTags(c, tag, out); });
  return out; }
var ackLinks = findTags(ackBox, "A");
ok(ackLinks.length === 1 && /gnu\.org\/licenses\/gpl-3\.0/.test(ackLinks[0].attrs.href), "ack: GPL link href", ackLinks.map(function (a) { return a.attrs.href; }));
ok(/noopener/.test(ackLinks[0].attrs.rel || ""), "ack: link rel noopener");
// clicking the button removes the overlay and persists the session flag
var ackBtn = ackBox.children.filter(function (c) { return c.className === "ack-btn"; })[0];
ok(ss.melecAck === undefined, "ack: no session flag before acknowledge");
ackBtn.click();
ok(findAck().length === 0, "ack: overlay removed after acknowledge click");
ok(ss.melecAck === "1", "ack: session flag persisted on acknowledge", ss);

// ---- 1. surfaceAmp regression (a past splice once deleted it)
ok(api.surfaceAmp("12", "cu", "75") === 25, "surfaceAmp 12cu75", api.surfaceAmp("12", "cu", "75"));
ok(api.surfaceAmp("4/0", "al", "90") === 205, "surfaceAmp 4/0 al90");

// ---- 2. corrected ICEA cells + propagation
ok(api.ICEA_A1.rows["2"][8] === 168, "A-1 2AWG col8 = 168");
ok(api.ICEA_A2.rows["2"][8] === 185, "A-2 2AWG col8 = 185");
ok(api.ICEA_A3.rows["2"][8] === 198, "A-3 2AWG col8 = 198");
ok(api.ICEA_A4.rows[9][0] === "300" && api.ICEA_A4.rows[9][5] === 403, "A-4 300row al2 = 403");
ok(api.ICEA_A5.rows[9][5] === 443, "A-5 300row al2 = 443");
ok(api.ICEA_A6.rows[9][5] === 476, "A-6 300row al2 = 476");
// derived-path lookup agrees
ok(api.iceaPPAmp("2", 8, 40) === 168 && api.iceaPPAmp("2", 8, 30) === 185 && api.iceaPPAmp("2", 8, 20) === 198,
  "iceaPPAmp 2AWG col8 = 168/185/198");
// A-1..A-3 monotonic in size for every column after the fix
["8","6","4","3","2","1","1/0","2/0","3/0","4/0","250","300","350","400","450","500"].reduce(function (prevRow, s) {
  var r = api.ICEA_A1.rows[s];
  if (prevRow) for (var c = 0; c < 9; c++)
    if (r[c] != null && prevRow[c] != null)
      ok(r[c] > prevRow[c], "A-1 monotonic col" + c + " at " + s, [prevRow[c], r[c]]);
  return r;
}, null);
// A-4..A-6 aluminum voltage-class monotonic on every row (the 393 fix's own criterion).
// Tolerance 1 A: the source's 350-row prints a genuine 1-A rounding dip (425/424/426)
// that the audit judged rounding noise, not a defect — only the 10-A 393 break was real.
[api.ICEA_A4, api.ICEA_A5, api.ICEA_A6].forEach(function (t, ti) {
  t.rows.forEach(function (r) {
    var al = [r[3], r[5], r[7]].filter(function (x) { return x != null; });
    // ±2: the base table's 1-A dip becomes 2 A after the ×1.10/×1.18 ambient scaling
    for (var i = 1; i < al.length; i++) ok(al[i] >= al[i-1] - 2, "A-" + (4+ti) + " al monotonic(±2) row " + r[0], al);
  });
});

// ---- 3. FH07 fix + full contiguity scan of the fixed column
ok(JSON.stringify(api.FH_AB[4][3]) === "[0.36,0.39]", "FH07 nonCompEncl_block3 = [0.36,0.39]", api.FH_AB[4][3]);
var p07 = api.selectHeater(0.37, 0, "non", true, "block3");
ok(p07.status === "ok" && p07.cat === "FH07", "0.37A size0 non/encl/block3 -> ok FH07", p07);

// ---- 4. selectHeater gap logic — exhaustive over every column variant
var variants = [];
[0,1,2].forEach(function (s) { ["non","amb"].forEach(function (c) { [false,true].forEach(function (e) {
  ["block3","single"].forEach(function (p) { variants.push([s,c,e,p]); }); }); }); });
[3,4].forEach(function (s) { ["non","amb"].forEach(function (c) { variants.push([s,c,true,"block3"]); }); });
[5,6].forEach(function (s) { [false,true].forEach(function (e) { variants.push([s,"non",e,"block3"]); }); });
var gapsTested = 0;
variants.forEach(function (v) {
  var rows = api.heaterRows(v[0], v[1], v[2], v[3]);
  for (var i = 0; i < rows.length; i++) {
    var lo = rows[i][1][0], hi = rows[i][1][1];
    // endpoints must be ok on their own row
    var a = api.selectHeater(lo, v[0], v[1], v[2], v[3]);
    var b = api.selectHeater(hi, v[0], v[1], v[2], v[3]);
    ok(a.status === "ok" && a.cat === rows[i][0], "endpoint lo ok " + rows[i][0] + " " + v.join("/"), a);
    ok(b.status === "ok" && b.cat === rows[i][0], "endpoint hi ok " + rows[i][0] + " " + v.join("/"), b);
    if (i > 0) {
      var phi = rows[i-1][1][1];
      if (lo - phi > 1e-9) { // printed gap
        var mid = (phi + lo) / 2;
        var g = api.selectHeater(mid, v[0], v[1], v[2], v[3]);
        gapsTested++;
        ok(g.status === "gap" && g.below.cat === rows[i-1][0] && g.above.cat === rows[i][0],
          "gap mid " + mid.toFixed(3) + " " + v.join("/") + " -> " + rows[i-1][0] + "/" + rows[i][0], g);
      }
    }
  }
  // below/above still work
  var below = api.selectHeater(rows[0][1][0] / 2, v[0], v[1], v[2], v[3]);
  ok(below.status === "below", "below " + v.join("/"), below.status);
  var above = api.selectHeater(rows[rows.length-1][1][1] * 2, v[0], v[1], v[2], v[3]);
  ok(above.status === "above", "above " + v.join("/"), above.status);
});
ok(gapsTested > 300, "gap sweep actually exercised the printed gaps", gapsTested);
// the audit's flagship case
var g1 = api.selectHeater(41.55, 2, "non", false, "block3");
ok(g1.status === "gap" && g1.below.cat === "FH56" && g1.above.cat === "FH57", "41.55A size2 -> gap FH56/FH57", g1);

// ---- 5. fuse sizes
ok(JSON.stringify(api.FUSE_SIZES.slice(0, 6)) === "[1,3,6,10,15,20]", "FUSE_SIZES head", api.FUSE_SIZES.slice(0, 6));
ok(api.FUSE_SIZES.indexOf(601) >= 0, "FUSE_SIZES has 601");
ok(api.nextStdFuse(2.75) === 3 && api.nextStdFuse(0.4) === 1 && api.nextStd(2.75) === 15, "nextStdFuse/nextStd");

// ---- 6. smallestTrailingCable joint constraint (50hp/460V default-path scenario)
var j = api.smallestTrailingCable(81.25, 455, "ug", "cu", "90", { fam: "pp", col: 6 }, "20");
ok(j && j.size === "4", "joint trailing minimum = 4 AWG", j);
ok(api.trailCap("4") === 500 && api.trailCap("6") === 300, "trailCap 4/6");

// ---- 7. calcMotor end-to-end: underground trailing conflict (the self-contradiction fix)
function setVals(m) { Object.keys(m).forEach(function (k) { document.getElementById(k).value = m[k]; }); }
setVals({ m_loc: "ug", m_phase: "3", m_volt: "460", m_hp: "50", m_flc: "65", m_fla: "",
  m_mat: "cu", m_temp: "90", m_ctype: "trailing", m_cable: "pp:6", m_amb: "20" });
api.calcMotor();
var t7 = txt(byId.m_out);
ok(/Trailing-cable minimum/.test(t7), "trailing minimum row present");
ok(/4 AWG/.test(t7), "joint answer 4 AWG shown");
ok(/75\.601-1 conflict/.test(t7), "125%-only pick flagged, not green");
ok(/none/.test(t7) && !/455 – 300/.test(t7), "no reversed window rendered");
ok(/smallest cable satisfying both/.test(t7), "callout names the joint size");

// ---- 8. calcMotor surface: NEC 430.52 device table
setVals({ m_loc: "surface", m_phase: "3", m_volt: "460", m_hp: "100", m_flc: "124", m_fla: "",
  m_mat: "cu", m_temp: "75", m_ctype: "other", m_cable: "pp:6", m_amb: "20" });
api.calcMotor();
var t8 = txt(byId.m_out);
ok(/NEC 430\.52 \(surface\)/.test(t8), "surface heading cites 430.52");
ok(/Dual-element \(time-delay\) fuse/.test(t8) && /Inverse-time circuit breaker/.test(t8), "device rows present");
ok(/300% \(FLC above 100 A\)/.test(t8), ">100A breaker ceiling shown");
ok(/372/.test(t8), "ITB ceiling 124*3=372 shown");
ok(/225/.test(t8), "TD fuse suggestion 225A (nextStdFuse(217))");
ok(!/exceeds 400%/.test(t8), "no flat-400% verdict on surface");

// ---- 8b. surface instantaneous-trip breaker (NEC Table 430.52) — Standard motor, FLC 124
ok(/instantaneous-trip circuit breaker \(NEC Table 430\.52\)/.test(t8), "surface: instantaneous-trip heading");
ok(/992/.test(t8), "surface std: 800% of 124 = 992 A");
ok(/1,612/.test(t8), "surface std: 1300% of 124 = 1,612 A");
ok(/430\.52\(C\)\(3\)/.test(t8) && /listed combination motor controller/.test(t8), "surface: 430.52(C)(3) controller caveat");
ok(/engineering evaluation/.test(t8), "surface: engineering-evaluation caveat");
ok(!/FLC × 700%/.test(t8), "surface: no underground 700% magnetic band");

// ---- 8c. surface Design B energy-efficient: 1100% start / 1700% max
setVals({ m_loc: "surface", m_flc: "124", m_designb: "designb", m_ctype: "other" });
api.calcMotor();
var t8b = txt(byId.m_out);
ok(/1,364/.test(t8b), "surface Design B: 1100% of 124 = 1,364 A");
ok(/2,108/.test(t8b), "surface Design B: 1700% of 124 = 2,108 A");
ok(/Design B energy-efficient/.test(t8b), "surface Design B: label present");
ok(!/FLC × 800%/.test(t8b) && !/1,612/.test(t8b), "surface Design B: standard 800%/1,612 window replaced");
setVals({ m_designb: "std" });   // restore Standard for later surface cases

// ---- 8d. underground regression: magnetic 700%/1300% band unchanged, no surface block
setVals({ m_loc: "ug", m_phase: "3", m_volt: "460", m_flc: "124", m_ctype: "other",
  m_cable: "pp:6", m_amb: "20", m_temp: "90" });
api.calcMotor();
var t8u = txt(byId.m_out);
ok(/magnetic circuit breaker/.test(t8u), "ug: magnetic CB heading unchanged");
ok(/FLC × 700%/.test(t8u) && /FLC × 1300%/.test(t8u), "ug: 700%/1300% band intact");
ok(!/instantaneous-trip circuit breaker \(NEC Table 430\.52\)/.test(t8u), "ug: no surface instantaneous block");

// ---- 9. small motor: no false red (both locations)
setVals({ m_loc: "ug", m_phase: "3", m_volt: "460", m_hp: "0.5", m_flc: "1.1", m_fla: "",
  m_mat: "cu", m_temp: "90", m_ctype: "other", m_cable: "pp:6", m_amb: "20" });
api.calcMotor();
var t9 = txt(byId.m_out);
ok(!/exceeds 400%/.test(t9), "ug small motor: no red exceeds-400%");
ok(/3 A fuse — or 15 A breaker/.test(t9), "ug small motor: fuse alternative offered", t9.slice(0, 0));
ok(/smallest standard/.test(t9), "ug small motor: info pill wording");
setVals({ m_loc: "surface", m_flc: "1.1" });
api.calcMotor();
var t9b = txt(byId.m_out);
ok(!/exceeds 400%/.test(t9b), "surface small motor: no red exceeds-400%");
ok(/above table max — Ex\. 1/.test(t9b), "surface small motor: pill names the above-max Ex.1 condition");

// ---- 9c. review fixes: wound-rotor caveat, >600A fuse ceiling, beyond-6000A case
ok(/wound-rotor motors are limited to 150%/.test(t9b), "surface note carries wound-rotor 150% caveat");
setVals({ m_loc: "surface", m_phase: "3", m_volt: "460", m_hp: "", m_flc: "250", m_fla: "", m_ctype: "other" });
api.calcMotor();
var t9c = txt(byId.m_out);
ok(/750/.test(t9c) && /Ex\. 2\(d\)/.test(t9c), "FLC 250: NTD fuse ceiling 750 A per Ex.2(d), not 1000 A");
ok(!/1,000 A \(400%/.test(t9c), "FLC 250: no 400% (1000 A) fuse ceiling shown");
setVals({ m_loc: "surface", m_flc: "160" });
api.calcMotor();
ok(/600 A fuse-class limit/.test(txt(byId.m_out)), "FLC 160: 640 A held to the 600 A fuse-class limit");
setVals({ m_loc: "ug", m_flc: "2500", m_ctype: "other" });
api.calcMotor();
var t9d = txt(byId.m_out);
ok(/exceeds the largest listed standard rating/.test(t9d), "ug FLC 2500: beyond-6000A case labeled correctly");
ok(!/below the smallest standard rating/.test(t9d), "ug FLC 2500: no inverted small-motor wording");
ok(!/1, 3, 6 and 10/.test(t9d), "ug FLC 2500: small-motor fuse note suppressed");

// ---- 9d. phase-change: hand-typed FLC preserved, stale auto-fill cleared
function fire(id, type) { (byId[id]._listeners[type] || []).forEach(function (f) { f.call(byId[id], {}); }); }
setVals({ m_phase: "3", m_volt: "460", m_hp: "", m_flc: "27" });
fire("m_phase", "change");
ok(String(byId.m_flc.value) === "27", "hand-typed FLC survives phase change", byId.m_flc.value);
setVals({ m_phase: "3", m_volt: "460" });
byId.m_hp.value = "50";
fire("m_hp", "change");   // auto-fills table FLC 65
ok(String(byId.m_flc.value) === "65", "auto-fill wrote 65", byId.m_flc.value);
fire("m_phase", "change");
ok(String(byId.m_flc.value) === "", "stale auto-filled FLC cleared on phase change", byId.m_flc.value);

// ---- 10. calcMotor heater messages: gap, no-NEMA-starter, CT note bound
setVals({ m_loc: "surface", m_phase: "3", m_volt: "460", m_hp: "25", m_flc: "34", m_fla: "34.55",
  m_mat: "cu", m_temp: "75", m_ctype: "other" });
api.calcMotor();  // 25hp/460 -> NEMA size 2 (the OT-19 worked example); FLA 34.55 in the FH54|FH55 gap (34.5|34.6)
var t10 = txt(byId.m_out);
ok(/between ranges|rounding gap/.test(t10), "motor tab: gap message (not above-chart)", null);
ok(!/above chart/.test(t10), "motor tab: no above-chart for gap FLA");
setVals({ m_loc: "surface", m_phase: "1", m_volt: "230", m_hp: "5", m_flc: "28", m_fla: "28" });
api.calcMotor();
var t10b = txt(byId.m_out);
ok(/no NEMA polyphase starter size applies to a single-phase motor/.test(t10b), "1-phase: err-specific heater reason");
ok(!/choose a horsepower above/.test(t10b), "1-phase: no bogus choose-HP advice");
setVals({ m_loc: "surface", m_phase: "3", m_volt: "460", m_hp: "500", m_flc: "590", m_fla: "590" });
api.calcMotor();
var t10c = txt(byId.m_out);
ok(!/undefined/.test(t10c), "size-7 starter: no literal 'undefined' in CT note");
ok(/advise full-load current/.test(t10c), "size-7: advise message intact");

// ---- 11. calcOverload: gap + boundary + next-up pill
setVals({ o_flc: "41.55", o_size: "2", o_comp: "non", o_encl: "open", o_pole: "block3" });
api.calcOverload();
var t11 = txt(byId.o_out);
ok(/FH56 \/ FH57/.test(t11), "overload tab headline shows both gap neighbors");
ok(/between ranges|rounding gap/.test(t11), "overload tab gap wording");
ok(!/above chart/.test(t11) && !/Wrong starter size/.test(t11) && !/Beyond the published chart/.test(t11),
  "overload tab: no false above-chart verdicts");
setVals({ o_flc: "41.5", o_size: "2", o_comp: "non", o_encl: "open", o_pole: "block3" });
api.calcOverload();
ok(/FH56/.test(txt(byId.o_out)), "boundary 41.5 -> FH56 ok");
setVals({ o_flc: "180", o_size: "5", o_comp: "non", o_encl: "open", o_pole: "block3" });
api.calcOverload();
ok(/FH28/.test(txt(byId.o_out)), "size5 180A -> FH28 (nameplate containment, not x1.25)");

// ---- 12. calcTrip: no-window headline + governed window intact
setVals({ tr_flc: "65", tr_size: "6" });
api.calcTrip();
var t12 = txt(byId.tr_out);
ok(/no setting in band/.test(t12), "trip: no-window headline (band framing, not 'impermissible')");
ok(!/455 – 300/.test(t12), "trip: no reversed range");
ok(/remains lawful/.test(t12) && /larger trailing-cable conductor is used/.test(t12),
  "trip: callout keeps cap-is-a-maximum framing + practical advice");
setVals({ tr_flc: "65", tr_size: "4/0" });
api.calcTrip();
ok(/455 – 845/.test(txt(byId.tr_out)), "trip: normal window still renders");

// ---- 13. dropdown order
byId.tr_size.children = [];
api.fillTripSize();
var opts = byId.tr_size.children.map(function (o) { return o.attrs.value; });
ok(opts[0] === "14" && opts.indexOf("1/0") > opts.indexOf("1") && opts.indexOf("1/0") < opts.indexOf("250")
  && opts[opts.length-1] === "500" && opts.length === 18,
  "tr_size ordered 14 AWG ... 4/0 ... 500 kcmil", opts.join(","));

// ---- 14. TRIP_B labels disclose top dial
ok(api.TRIP_B.frames.every(function (f) {
  var m = /top dial (\d+)/.exec(f.r); return m && Number(m[1]) === f.v[f.v.length-1];
}), "TRIP_B labels carry the real top dial", api.TRIP_B.frames.map(function (f) { return f.r; }));

// ---- 15. nextUpRow pill honest
var pk = api.selectHeater(41.5, 2, "non", false, "block3");
var nu = api.nextUpRow(pk, 41.5);
ok(nu.pill.cls === "info", "next-size-up pill is info, not warn/bad", nu.pill);

// ---- 16. NEC 110.14(C) termination-rating warning (temp over 60 C, surface only)
function warnNotes(el) { return el.children.filter(function (c) { return c.className === "note warn"; }); }
setVals({ m_loc: "surface", m_phase: "3", m_volt: "460", m_hp: "", m_flc: "124", m_fla: "",
  m_mat: "cu", m_temp: "75", m_ctype: "other" });
api.calcMotor();
var t16 = txt(byId.m_out);
ok(/110\.14\(C\)/.test(t16), "motor surface 75C: termination warning cites 110.14(C)");
ok(/75 °C ampacity applies only if the terminations/.test(t16), "motor surface 75C: warning names the selected temp");
ok(/lowest-rated connection/.test(t16), "motor surface 75C: derate-to-lowest sentence present");
ok(warnNotes(byId.m_out).some(function (n) { return /110\.14\(C\)/.test(n.textContent); }),
  "motor surface 75C: warning uses warn styling");
setVals({ m_temp: "90" });
api.calcMotor();
ok(/90 °C ampacity applies only if the terminations/.test(txt(byId.m_out)), "motor surface 90C: warning says 90 °C");
setVals({ m_temp: "60" });
api.calcMotor();
ok(!/110\.14\(C\)/.test(txt(byId.m_out)), "motor surface 60C: no termination warning");
setVals({ m_loc: "ug", m_temp: "75", m_cable: "pp:6", m_amb: "20" });
api.calcMotor();
var t16u = txt(byId.m_out);
ok(!/110\.14\(C\)/.test(t16u) && /not used underground/.test(t16u),
  "motor ug 75C: underground note shown, termination warning suppressed");

byId.f_rows.children.length = 0;
byId.f_rows.children.push({ _get: function () { return { flc: 100, qty: 1 }; } });
setVals({ f_loc: "surface", f_mat: "cu", f_temp: "90" });
api.calcFeeder();
var t16f = txt(byId.f_out);
ok(/110\.14\(C\)/.test(t16f) && /90 °C ampacity applies only if the terminations/.test(t16f),
  "feeder surface 90C: termination warning shown");
setVals({ f_temp: "60" });
api.calcFeeder();
ok(!/110\.14\(C\)/.test(txt(byId.f_out)), "feeder surface 60C: no termination warning");
setVals({ f_loc: "ug", f_temp: "75", f_cable: "pp:6", f_amb: "20" });
api.calcFeeder();
var t16fu = txt(byId.f_out);
ok(!/110\.14\(C\)/.test(t16fu) && /not used underground/.test(t16fu),
  "feeder ug 75C: underground note shown, termination warning suppressed");
byId.f_rows.children.length = 0;

// ---- 17. Feeder short-circuit protection (NEC 430.62(A) / NEC-1968 430-62(a))

// 17a. 1968 Table 430-150 integrity (positionally derived from the MSHA reprint)
ok(api.FLC68.length === 21, "FLC68: 21 rows (1/2–200 HP)", api.FLC68.length);
ok(api.FLC68[0][0] === 0.5 && api.FLC68[20][0] === 200, "FLC68: HP range 0.5–200");
ok(api.lookupFLC68("460", 1) === 1.8, "FLC68: 1 HP 460 V = 1.8 (differs from modern 2.1)");
ok(api.lookupFLC("3", "460", 1) === 2.1, "FLC3: 1 HP 460 V = 2.1 (modern, for contrast)");
ok(api.lookupFLC68("575", 0.5) === 0.8, "FLC68: 1/2 HP 575 V = 0.8");
ok(api.lookupFLC68("230", 200) === 480 && api.lookupFLC68("460", 200) === 240
   && api.lookupFLC68("575", 200) === 192 && api.lookupFLC68("2300", 200) === 49,
   "FLC68: 200 HP row 480/240/192/49");
ok(api.lookupFLC68("2300", 60) === 16, "FLC68: 60 HP 2300 V = 16");
ok(api.lookupFLC68("208", 10) === 30.8, "FLC68: 208 V = 230 V × 1.10 (10 HP → 30.8)");
ok(api.lookupFLC68("200", 10) === 32.2, "FLC68: 200 V = 230 V × 1.15 (10 HP → 32.2)");
ok(api.lookupFLC68("115", 3) === null, "FLC68: 3 HP has no 115 V value");
ok(api.lookupFLC68("2300", 50) === null, "FLC68: 50 HP has no 2300 V value");
ok(api.lookupFLC68("995", 100) === null, "FLC68: unlisted voltage → null");
ok(api.lookupFLC68("460", 45) === null, "FLC68: unlisted HP → null");
// per-column strict monotonic increase wherever tabulated
for (var c68 = 0; c68 < 5; c68++) {
  var prev68 = null;
  api.FLC68.forEach(function (r) {
    var v = r[1][c68];
    if (v == null) return;
    ok(prev68 === null || v > prev68, "FLC68 monotonic col " + c68 + " at " + r[0] + " HP", [prev68, v]);
    prev68 = v;
  });
}

// 17b. prevStdFuse / prevStd edges
ok(api.prevStdFuse(0.5) === null, "prevStdFuse(0.5) = null");
ok(api.prevStdFuse(1) === 1 && api.prevStdFuse(2) === 1, "prevStdFuse 1/2 → 1");
ok(api.prevStdFuse(610) === 601, "prevStdFuse(610) = 601");
ok(api.prevStdFuse(600.5) === 600, "prevStdFuse(600.5) = 600");
ok(api.prevStdFuse(7000) === 6000, "prevStdFuse(7000) = 6000");
ok(api.prevStd(14) === null, "prevStd(14) = null (below smallest breaker)");
ok(api.prevStd(198) === 175, "prevStd(198) = 175 (not 200)");

// 17c. branchDevRating (branch devices round UP; ceilings are 430.52 Ex.2 / 1968 430-52 Ex.a)
var bd = api.branchDevRating(52, "surface", "itb");
ok(bd.raw === 130 && bd.std === 150 && bd.ceil === 208 && !bd.fuse, "branchDevRating itb 52 A → 150 std, 208 ceil", bd);
bd = api.branchDevRating(150, "surface", "itb");
ok(bd.std === 400 && bd.ceil === 450, "branchDevRating itb 150 A: ceil 300% above 100 A", bd);
bd = api.branchDevRating(27, "surface", "tdfuse");
ok(Math.abs(bd.raw - 47.25) < 1e-9 && bd.std === 50 && bd.fuse, "branchDevRating tdfuse 27 A → 50 std", bd);
bd = api.branchDevRating(250, "surface", "ntdfuse");
ok(bd.std === 800 && bd.ceil === 750, "branchDevRating ntdfuse 250 A: Ex.2(d) ceil 750", bd);
bd = api.branchDevRating(100, "ug", "tlcb");
ok(bd.std === 250 && bd.ceil === 400, "branchDevRating ug tlcb 100 A → 250 std, 400 ceil", bd);
ok(api.branchDevRating(52, "surface", "inst") === null, "branchDevRating inst → null (substitution-only)");
ok(api.branchDevRating(0, "surface", "itb") === null, "branchDevRating flc 0 → null");

// 17d. feederSC — hand-computed surface example (round-DOWN check)
var sc = api.feederSC([{ flc: 52, qty: 1 }, { flc: 34, qty: 1 }, { flc: 14, qty: 1 }], "surface", "itb");
ok(sc.maxDev === 150 && sc.flcExcluded === 52, "feederSC surface: largest branch device 150 (52 A motor)", sc);
ok(Math.abs(sc.sumOthers - 48) < 1e-9 && Math.abs(sc.computedMax - 198) < 1e-9,
   "feederSC surface: 150 + 48 = 198 A computed max", sc);
ok(sc.std === 175 && !sc.noStd, "feederSC surface: standard feeder device 175 A (rounded DOWN, not 200)", sc.std);
ok(!sc.tie && !sc.anySub && !sc.ratingMissing && sc.count === 3, "feederSC surface: flags clean");

// 17e. equal-largest counted once — qty>1 on one row
sc = api.feederSC([{ flc: 65, qty: 2 }], "surface", "itb");
ok(sc.maxDev === 175, "feederSC qty2: branch device 175 (65×2.5=162.5→175)", sc.maxDev);
ok(Math.abs(sc.computedMax - 240) < 1e-9 && sc.std === 225 && sc.tie === true,
   "feederSC qty2: 175 + 65 = 240 → 225 std, tie flagged", sc);

// 17f. two-row rating tie with unequal FLCs — larger FLC excluded (conservative)
sc = api.feederSC([{ flc: 58, qty: 1 }, { flc: 52, qty: 1 }], "surface", "itb");
ok(sc.maxDev === 150 && sc.flcExcluded === 58 && sc.tie === true,
   "feederSC tie: both → 150; 58 A (larger) counted as the largest", sc);
ok(Math.abs(sc.computedMax - 202) < 1e-9 && sc.std === 200, "feederSC tie: 150 + 52 = 202 → 200 std", sc);

// 17g. entered (override) branch ratings are used verbatim + annotated
sc = api.feederSC([{ flc: 52, qty: 1, devType: "itb", dev: 200 }, { flc: 34, qty: 1 }], "surface", "itb");
ok(sc.maxDev === 200 && Math.abs(sc.computedMax - 234) < 1e-9 && sc.std === 225,
   "feederSC override: entered 200 A used → 234 → 225 std", sc);
ok(sc.items[0].basis === "entered" && !sc.items[0].aboveCeil && !sc.items[0].nonStandard,
   "feederSC override: 200 ≤ 208 ceil, standard size", sc.items[0]);
sc = api.feederSC([{ flc: 52, qty: 1, devType: "itb", dev: 210 }], "surface", "itb");
ok(sc.items[0].aboveCeil === true && sc.items[0].nonStandard === true,
   "feederSC override: 210 > 208 ceil flagged, non-standard flagged", sc.items[0]);
sc = api.feederSC([{ flc: 65, qty: 1, devType: "itb", dev: 175, devAuto: true }], "surface", "itb");
ok(sc.items[0].basis === "auto" && sc.items[0].rating === 175,
   "feederSC devAuto: auto-filled field reported as table basis, not entered", sc.items[0]);

// 17h. instantaneous-trip branch devices — surface 430.62(A) Exception substitution.
// 2026-07-11 fix (N1): the Exception ASSUMES "a rating not exceeding the maximum
// percentage of motor full-load current permitted by Table 430.52" — the percentage
// itself (pct×FLC), NEVER rounded up to the next standard size (that allowance is
// for real installed branch devices only). The pre-fix code used nextStd(pct×FLC),
// overstating the feeder maximum by up to one standard size (non-conservative).
sc = api.feederSC([{ flc: 52, qty: 1, devType: "inst" }, { flc: 34, qty: 1 }], "surface", "tdfuse");
ok(sc.items[0].basis === "sub" && sc.items[0].rating === 91 && sc.anySub === true,
   "feederSC inst surface (fuse feeder): assumed tdfuse rating 91 (52×1.75, no round-up)", sc.items[0]);
ok(sc.fdFuse === true && Math.abs(sc.computedMax - 125) < 1e-9 && sc.std === 125,
   "feederSC inst surface: 91 + 34 = 125 → 125 std on the FUSE ladder", sc);
sc = api.feederSC([{ flc: 52, qty: 1, devType: "inst" }, { flc: 34, qty: 1 }], "surface", "itb");
ok(sc.items[0].rating === 130, "feederSC inst surface (breaker feeder): assumed itb rating 130 (52×2.5)", sc.items[0]);
ok(sc.items[1].rating === 90 && Math.abs(sc.computedMax - 164) < 1e-9 && sc.std === 150,
   "feederSC inst surface: 130 + 34 = 164 → 150 std", sc);
// the audit's flagship non-conservative cases — pre-fix code reported 175 / 100 here
sc = api.feederSC([{ flc: 52, qty: 1, devType: "inst" }, { flc: 27, qty: 1 }], "surface", "itb");
ok(Math.abs(sc.computedMax - 157) < 1e-9 && sc.std === 150,
   "feederSC N1: assumed 130 + 27 = 157 → 150 std (pre-fix bug: 175)", sc);
sc = api.feederSC([{ flc: 34, qty: 1, devType: "inst" }, { flc: 10, qty: 1 }], "surface", "itb");
ok(Math.abs(sc.computedMax - 95) < 1e-9 && sc.std === 90,
   "feederSC N1: assumed 85 + 10 = 95 → 90 std (pre-fix bug: 100)", sc);
sc = api.feederSC([{ flc: 52, qty: 1, devType: "inst" }], "surface", "itb");
ok(sc.single === true && Math.abs(sc.computedMax - 130) < 1e-9 && sc.std === 125,
   "feederSC N1 single inst motor: assumed 130 rounds DOWN to 125 (no next-size-up)", sc);
sc = api.feederSC([{ flc: 52, qty: 1, devType: "inst" }, { flc: 27, qty: 1 }], "surface", "ntdfuse");
ok(sc.items[0].rating === 156 && Math.abs(sc.computedMax - 183) < 1e-9 && sc.std === 175,
   "feederSC N1 ntdfuse feeder: assumed 156 (52×3); 183 → 175 fuse std", sc);

// 17i. instantaneous-trip underground — conservative 1968 substitution (250% time-limit column)
sc = api.feederSC([{ flc: 100, qty: 1, devType: "inst" }, { flc: 50, qty: 1 }], "ug", "tlcb");
ok(sc.items[0].basis === "sub-ug" && sc.items[0].rating === 250 && sc.anyUgInst === true,
   "feederSC inst ug: substituted 250 (100×2.5), never the magnetic setting", sc.items[0]);
ok(Math.abs(sc.computedMax - 300) < 1e-9 && sc.std === 300, "feederSC inst ug: 250 + 50 = 300 → 300 std", sc);

// 17j. qty edge cases + single motor + defaults
ok(api.feederSC([{ flc: 10, qty: 0 }], "surface", "itb") === null, "feederSC: qty-0-only → null");
sc = api.feederSC([{ flc: 50, qty: 0 }, { flc: 20, qty: 1 }], "surface", "itb");
ok(sc.count === 1 && sc.maxDev === 50, "feederSC: qty-0 row ignored (20×2.5=50, already standard)", sc);
sc = api.feederSC([{ flc: 30, qty: 3 }, { flc: 20, qty: 1 }], "surface", "itb");
ok(sc.maxDev === 80 && Math.abs(sc.sumFlc - 110) < 1e-9 && Math.abs(sc.computedMax - 160) < 1e-9,
   "feederSC qty3: 30×2.5=75→80; 80 + (110−30) = 160", sc);
ok(sc.std === 150 && sc.tie === true, "feederSC qty3: 160 → 150 std, qty tie flagged", sc.std);
sc = api.feederSC([{ flc: 100, qty: 1 }], "ug", "tlcb");
ok(sc.single === true && sc.maxDev === 250 && Math.abs(sc.computedMax - 250) < 1e-9 && sc.std === 250,
   "feederSC single motor ug: max = branch rating itself (250)", sc);
sc = api.feederSC([{ flc: 100, qty: 1 }], "surface", undefined);
ok(sc.feederDev === "itb" && sc.maxDev === 250, "feederSC: missing feeder device defaults to itb", sc);
sc = api.feederSC([{ flc: 100, qty: 1 }], "ug", "inst");
ok(sc.feederDev === "tlcb", "feederSC: substitution-only feeder device falls back to breaker", sc.feederDev);

// 17k. below-smallest-standard and unratable rows
sc = api.feederSC([{ flc: 2, qty: 1, devType: "itb", dev: 10 }], "surface", "itb");
ok(Math.abs(sc.computedMax - 10) < 1e-9 && sc.std === null && sc.noStd === true,
   "feederSC noStd: computed 10 A has no standard breaker at or below it", sc);
sc = api.feederSC([{ flc: 2, qty: 1, devType: "itb", dev: 2.5 }], "surface", "tdfuse");
ok(sc.std === 1, "feederSC fuse feeder: 2.5 A computed → 1 A standard fuse", sc.std);
sc = api.feederSC([{ flc: 3000, qty: 1 }, { flc: 100, qty: 1 }], "surface", "itb");
ok(sc.ratingMissing === true && sc.computedMax === undefined,
   "feederSC: 3000 A motor has no standard branch rating → calc withheld", sc);

// 17o. underground instantaneous (magnetic) element — setting-to-setting 430-62(a)
// The conversation example: 100 HP (124 A) + 50 HP (65 A) @460 V, both on magnetic breakers.
sc = api.feederSC([{ flc: 124, qty: 1, devType: "inst" }, { flc: 65, qty: 1, devType: "inst" }], "ug", "tlcb");
ok(sc.mag && sc.mag.items[0].val === 868 && sc.mag.items[0].basis === "auto",
   "mag: 100 HP branch setting auto 868 (700% × 124)", sc.mag && sc.mag.items[0]);
ok(sc.mag.items[1].val === 455, "mag: 50 HP branch setting auto 455 (700% × 65)", sc.mag.items[1]);
ok(sc.mag.maxDev === 868 && sc.mag.flcExcluded === 124 && Math.abs(sc.mag.maxSetting - 933) < 1e-9,
   "mag: feeder instantaneous max = 868 + 65 = 933 A", sc.mag);
ok(sc.mag.tie === false && !sc.mag.anyAboveCeil && !sc.mag.anyBelowStart, "mag: flags clean");
// the OC (rating) block is unchanged by the mag block: 350 + 65 = 415 → 400 std
ok(sc.maxDev === 350 && Math.abs(sc.computedMax - 415) < 1e-9 && sc.std === 400,
   "mag scenario: rating-basis block still 350+65=415 → 400", [sc.maxDev, sc.computedMax, sc.std]);

// entered branch setting raises/caps the ceiling
sc = api.feederSC([{ flc: 124, qty: 1, devType: "inst", dev: 1100 }, { flc: 65, qty: 1, devType: "inst" }], "ug", "tlcb");
ok(sc.mag.items[0].basis === "entered" && Math.abs(sc.mag.maxSetting - 1165) < 1e-9 && !sc.mag.anyAboveCeil,
   "mag entered: 1100 + 65 = 1165 A, within 1300%", sc.mag);
sc = api.feederSC([{ flc: 124, qty: 1, devType: "inst", dev: 1700 }], "ug", "tlcb");
ok(sc.mag.items[0].aboveCeil === true && sc.mag.anyAboveCeil === true,
   "mag entered: 1700 > 1612 (1300% of 124) flagged", sc.mag.items[0]);
sc = api.feederSC([{ flc: 124, qty: 1, devType: "inst", dev: 600 }], "ug", "tlcb");
ok(sc.mag.items[0].belowStart === true && !sc.mag.items[0].aboveCeil,
   "mag entered: 600 < 868 flagged below the 700% start point", sc.mag.items[0]);

// devAuto on an inst row: field value ignored, 700% auto used
sc = api.feederSC([{ flc: 124, qty: 1, devType: "inst", dev: 868, devAuto: true }], "ug", "tlcb");
ok(sc.mag.items[0].basis === "auto" && sc.mag.items[0].val === 868, "mag devAuto: reported as 700% auto");

// 2026-07-11 fix (F1): auto setting = floor(flc*700+1e-6)/100 — exact 700% for any
// FLC with ≤2 decimals, NEVER above the Table 430-152 column (the old round(×70)/10
// quantized 0.1 A either side of 700%); belowStart flags ENTERED settings only (the
// auto value IS the start point — flagging it misread the tool's own suggestion).
sc = api.feederSC([{ flc: 10.03, qty: 1, devType: "inst" }, { flc: 5, qty: 1 }], "ug", "tlcb");
ok(Math.abs(sc.mag.items[0].val - 70.21) < 1e-12 && sc.mag.items[0].basis === "auto",
   "mag F1: 10.03 A auto = exactly 70.21 (old formula said 70.2)", sc.mag.items[0]);
ok(sc.mag.anyBelowStart === false, "mag F1: auto value never flagged belowStart");
sc = api.feederSC([{ flc: 2.64, qty: 1, devType: "inst" }], "ug", "tlcb");
ok(Math.abs(sc.mag.items[0].val - 18.48) < 1e-12,
   "mag F1: 2.64 A auto = 18.48, never rounded ABOVE 700% (old formula said 18.5)", sc.mag.items[0].val);
// F6: dead aggregates removed — reappearing fields would mean a regression
ok(sc.maxIdx === undefined && sc.mag.maxIdx === undefined && sc.mag.anyEntered === undefined,
   "feederSC F6: maxIdx / mag.maxIdx / mag.anyEntered stay removed", sc);
// F3: a magnetic row beyond the standard-size ladder is flagged distinctly — entering
// a SETTING on that row cannot bound the overcurrent element (thermal rows can be
// bounded by entering the installed rating, so they must NOT carry the flag)
sc = api.feederSC([{ flc: 2500, qty: 1, devType: "inst" }], "ug", "tlcb");
ok(sc.ratingMissing === true && sc.ugInstUnbounded === true,
   "feederSC F3: 2500 A magnetic row → ratingMissing + ugInstUnbounded", sc);
sc = api.feederSC([{ flc: 2500, qty: 1 }], "ug", "tlcb");
ok(sc.ratingMissing === true && sc.ugInstUnbounded === false,
   "feederSC F3: 2500 A thermal row → ratingMissing only", sc);

// mixed thermal + magnetic: thermal row contributes its RATING ("rating or setting")
sc = api.feederSC([{ flc: 124, qty: 1, devType: "tlcb" }, { flc: 65, qty: 1, devType: "inst" }], "ug", "tlcb");
ok(sc.mag.items[0].basis === "rating" && sc.mag.items[0].val === 350,
   "mag mixed: 100 HP thermal row contributes its 350 A rating", sc.mag.items[0]);
ok(sc.mag.maxDev === 455 && sc.mag.flcExcluded === 65 && Math.abs(sc.mag.maxSetting - 579) < 1e-9,
   "mag mixed: largest is the 50 HP magnetic (455); 455 + 124 = 579 A", sc.mag);

// equal-largest with qty>1 counts once
sc = api.feederSC([{ flc: 65, qty: 2, devType: "inst" }], "ug", "tlcb");
ok(sc.mag.tie === true && Math.abs(sc.mag.maxSetting - 520) < 1e-9,
   "mag qty2: 455 + 65 = 520 A, tie flagged", sc.mag);

// never computed for surface — the modern NEC has no instantaneous column for feeders
sc = api.feederSC([{ flc: 124, qty: 1, devType: "inst" }, { flc: 65, qty: 1 }], "surface", "itb");
ok(sc.mag === undefined, "mag: absent for surface (430.52(C)(3) confines inst-trip to branch controllers)");

// dial guidance: highest lawful position per frame, all at or below the max.
// 2026-07-11 fix (F2): EVERY qualifying frame is listed — the old slice(0,6)
// silently dropped the smallest frames, which read as "no lawful position".
var picks = api.feederTripPicks(933);
ok(picks.length === 8, "trip picks: all 8 qualifying frames listed at 933 A", picks.length);
ok(picks.some(function (p) { return p.setting === 142; }) && picks.some(function (p) { return p.setting === 180; }),
   "trip picks: small frames (top dials 142/180) no longer dropped", picks.map(function (p) { return p.setting; }));
ok(picks.every(function (p) { return p.setting <= 933 + 1e-9; }), "trip picks: all ≤ 933", picks);
for (var pk = 1; pk < picks.length; pk++)
  ok(picks[pk].setting <= picks[pk-1].setting + 1e-9, "trip picks: sorted descending @" + pk, picks);
ok(picks.some(function (p) { return p.setting === 875 && p.range === "500–1000"; }),
   "trip picks: 500–1000 frame capped at 875 (position 6)", picks);
ok(api.feederTripPicks(40).length === 0, "trip picks: none below every frame's lowest position");

// 17l. rendered output — surface then underground (DOM-driven through calcFeeder)
byId.f_rows.children.length = 0;
byId.f_rows.children.push({ _get: function () { return { flc: 52, qty: 1 }; } });
byId.f_rows.children.push({ _get: function () { return { flc: 34, qty: 1 }; } });
byId.f_rows.children.push({ _get: function () { return { flc: 14, qty: 1 }; } });
setVals({ f_loc: "surface", f_mat: "cu", f_temp: "75", f_dev: "itb" });
api.calcFeeder();
var tsc = txt(byId.f_out);
ok(/430\.62\(A\)/.test(tsc), "calcFeeder surface: cites NEC 430.62(A)");
ok(/175 A/.test(tsc), "calcFeeder surface: shows the 175 A round-down pick");
ok(/not exceeding/i.test(tsc), "calcFeeder surface: explains round-down (not exceeding)");
ok(/[Gg]round-fault protection/.test(tsc), "calcFeeder surface: GF-separate note retained");
ok(!/Maximum instantaneous setting/.test(tsc) && !/magnetic\) element/.test(tsc),
   "calcFeeder surface: no instantaneous-element block (not a modern-NEC feeder rule)");
setVals({ f_loc: "ug", f_temp: "90", f_cable: "pp:6", f_amb: "40", f_dev: "tlcb" });
api.calcFeeder();
var tscu = txt(byId.f_out);
ok(/430-62\(a\)/.test(tscu), "calcFeeder ug: cites NEC-1968 430-62(a)");
ok(/75\.900/.test(tscu), "calcFeeder ug: cites 30 CFR 75.900");
ok(/circuit breaker/i.test(tscu), "calcFeeder ug: breaker requirement noted");
ok(/instantaneous \(magnetic\) element/i.test(tscu), "calcFeeder ug: magnetic-element section present");
ok(/Maximum instantaneous setting/.test(tscu), "calcFeeder ug: instantaneous setting ceiling rendered");
ok(/trailing/i.test(tscu) && /75\.601-1/.test(tscu), "calcFeeder ug: 75.601-1 trailing-cables-only note");
ok(/700%/.test(tscu) && /1300%/.test(tscu), "calcFeeder ug: 700%/1300% band stated");
byId.f_rows.children.length = 0;
setVals({ f_loc: "surface", f_temp: "75" });

// 17n. real feeder rows — auto-fill, override stickiness, inst-trip lock, location switch
function fireEl(el, type) { (el._listeners[type] || []).forEach(function (f) { f.call(el, {}); }); }
byId.f_rows.children.length = 0;
setVals({ f_loc: "surface", f_phase: "3", f_volt: "460", f_dev: "itb" });
fireEl(byId.f_loc, "change");                    // rebuild volt/dev lists for surface
setVals({ f_volt: "460", f_dev: "itb" });
api.addFeederRow();
var fi = byId.f_rows.children[0], grid = fi.children[0];
var rHp = grid.children[0].children[1], rFlc = grid.children[1].children[1],
    rQty = grid.children[2].children[1], rDev = grid.children[3].children[1],
    rIn = grid.children[4].children[1];
ok(rHp.children.some(function (o) { return o.value === "250"; }),
   "row surface: HP list is modern FLC3 (250 HP present)");
rHp.value = "50"; fireEl(rHp, "change");
ok(rFlc.value === "65", "row: 50 HP @460 V 3φ auto-fills 65 A", rFlc.value);
ok(rIn.value === "175", "row: branch rating auto-computes 175 (65×2.5=162.5→175)", rIn.value);
var g0 = fi._get();
ok(g0.flc === 65 && g0.qty === 1 && g0.devType === "itb" && g0.dev === 175,
   "row _get: {65, 1, itb, 175}", g0);
ok(g0.devAuto === true, "row _get: auto-filled rating flagged devAuto", g0);
rIn.value = "150";                             // user overrides the rating
ok(fi._get().devAuto === false, "row _get: override clears devAuto");
setVals({ f_volt: "230" }); fireEl(byId.f_volt, "change");
ok(rFlc.value === "130", "row: voltage change re-fills auto FLC (50 HP @230 V = 130)", rFlc.value);
ok(rIn.value === "150", "row: user-entered rating survives the voltage change", rIn.value);
rIn.value = ""; fireEl(rDev, "change");          // blank field resumes auto tracking
ok(rIn.value === "350", "row: cleared rating resumes auto (130×2.5=325→350)", rIn.value);
rDev.value = "inst"; fireEl(rDev, "change");
ok(rIn.disabled === true && rIn.value === "325",
   "row inst: rating input locked, shows the ASSUMED 325 (130×2.5, no round-up — N1)", [rIn.disabled, rIn.value]);
ok(isNaN(fi._get().dev) && fi._get().devType === "inst",
   "row inst _get: dev withheld (NaN), devType inst");
setVals({ f_loc: "ug" }); fireEl(byId.f_loc, "change");
ok(byId.f_phase.value === "3" && byId.f_phase.disabled === true, "ug: phase locked to 3φ");
ok(!byId.f_volt.children.some(function (o) { return o.value === "2300"; }),
   "ug: 2300 V excluded from the feeder voltage list");
ok(byId.f_dev.children.length === 1 && byId.f_dev.value === "tlcb",
   "ug: feeder device fixed to circuit breaker");
ok(rHp.children.some(function (o) { return o.value === "200"; })
   && !rHp.children.some(function (o) { return o.value === "250"; }),
   "ug: HP list switches to 1968 table (max 200 HP)");
ok(rHp.value === "50" && rFlc.value === "130",
   "ug: 50 HP kept; 1968 FLC 130 @230 V matches", [rHp.value, rFlc.value]);
ok(rDev.value === "inst" && rIn.disabled === false && rIn.value === "910",
   "ug: inst row UNLOCKED with 700% setting auto (130×7=910)", [rIn.disabled, rIn.value]);
var gi = fi._get();
ok(gi.devType === "inst" && gi.dev === 910 && gi.devAuto === true,
   "ug inst _get: setting 910 carried with devAuto", gi);
rIn.value = "1200";                            // installed setting override
ok(fi._get().dev === 1200 && fi._get().devAuto === false, "ug inst _get: entered setting 1200 carried");
// 2026-07-11 fix (N2): switching the device TYPE discards the entered value — a
// 700–1300% magnetic SETTING must never survive as an "entered" thermal RATING in
// the rating-basis 430.62 sum (pre-fix: 1200 leaked through and inflated the max)
rDev.value = "tlcb"; fireEl(rDev, "change");
ok(rIn.value === "350" && fi._get().devAuto === true,
   "N2: entered magnetic setting discarded on switch to thermal — auto rating 350", [rIn.value, fi._get()]);
rDev.value = "inst"; fireEl(rDev, "change");
ok(rIn.value === "910" && fi._get().devAuto === true,
   "N2: switch back to magnetic resumes the 700% auto (910), not the stale 1200", rIn.value);
rIn.value = ""; fireEl(rDev, "change");
ok(rIn.value === "910", "ug inst: cleared setting resumes 700% auto", rIn.value);
rDev.value = "tlcb"; fireEl(rDev, "change");
ok(rIn.disabled === false && rIn.value === "350", "ug: back to thermal breaker, auto rating 350");
rQty.value = "0";
ok(fi._get().qty === 0, "row qty 0 accepted for exclusion");
byId.f_rows.children.length = 0;
setVals({ f_loc: "surface" }); fireEl(byId.f_loc, "change");
setVals({ f_temp: "75", f_volt: "460", f_dev: "itb" });

// 17q. 2026-07-11 review fixes — rendered behavior
// (i) N2 via _refresh: a LOCATION change remaps the device type programmatically
// (itb → tlcb) without firing the devSel change event — the entered rating must
// reset to auto, not silently change ladders/ceilings under the new type
byId.f_rows.children.length = 0;
api.addFeederRow();
var fq = byId.f_rows.children[0], gq = fq.children[0];
var qHp = gq.children[0].children[1], qFlc = gq.children[1].children[1],
    qDev = gq.children[3].children[1], qIn = gq.children[4].children[1];
qHp.value = "50"; fireEl(qHp, "change");        // FLC 65, auto rating 175
qIn.value = "6";                                // user-entered surface itb rating
setVals({ f_loc: "ug", f_cable: "pp:6", f_amb: "40" }); fireEl(byId.f_loc, "change");
ok(qDev.value === "tlcb", "N2 _refresh: location switch remapped the branch device itb → tlcb");
ok(qIn.value === "175" && fq._get().devAuto === true,
   "N2 _refresh: entered surface rating reset to UG auto 175, not silently reused", [qIn.value, fq._get()]);
byId.f_rows.children.length = 0;
setVals({ f_loc: "surface" }); fireEl(byId.f_loc, "change");
setVals({ f_volt: "460", f_dev: "itb" });
// (ii) F4: a single row must still render the branch table and its compliance pills
byId.f_rows.children.length = 0;
byId.f_rows.children.push({ _get: function () { return { flc: 65, qty: 1, devType: "tlcb", dev: 400 }; } });
setVals({ f_loc: "ug", f_temp: "90", f_cable: "pp:6", f_amb: "40" });
api.calcFeeder();
var tq1 = txt(byId.f_out);
ok(/Branch-circuit devices feeding the 430\.62 computation/.test(tq1),
   "F4: single-row branch table renders (was suppressed by the >1 gate)");
ok(/above 400% — verify/.test(tq1),
   "F4: entered 400 A on a 65 A motor (ceil 260) draws the warn pill even with one row");
// (iii) empty trip-picks: explicit callout, no phantom-table sentence
byId.f_rows.children.length = 0;
byId.f_rows.children.push({ _get: function () { return { flc: 0.8, qty: 1, devType: "inst" }; } });
api.calcFeeder();
var tq2 = txt(byId.f_out);
ok(/No listed breaker frame has a dial position at or below/.test(tq2),
   "empty picks: explicit no-lawful-frame callout (0.8 A motor → 5.6 A ceiling)");
ok(/lowest dial in the tabulated frames is 50 A/.test(tq2), "empty picks: callout names the 50 A minimum dial");
ok(!/lists every frame with at least one lawful position/.test(tq2),
   "empty picks: table-description sentence suppressed when no table renders");
// (iv) F3 callout: magnetic-row-specific guidance when the ladder cannot cover it
byId.f_rows.children.length = 0;
byId.f_rows.children.push({ _get: function () { return { flc: 2500, qty: 1, devType: "inst" }; } });
api.calcFeeder();
ok(/entering a setting cannot bound/.test(txt(byId.f_out)),
   "F3: callout explains that entering a setting cannot bound a magnetic row");
// (v) unratable auto row: 'cannot bound' pill, never a green OK
byId.f_rows.children.length = 0;
byId.f_rows.children.push({ _get: function () { return { flc: 3000, qty: 1 }; } });
setVals({ f_loc: "surface", f_temp: "75", f_dev: "itb" });
api.calcFeeder();
ok(/cannot bound/.test(txt(byId.f_out)), "unratable auto row: 'cannot bound' pill replaces OK");
// (vi) N1 rendered: assumed-basis label, no-next-size-up note, corrected 150 A pick
byId.f_rows.children.length = 0;
byId.f_rows.children.push({ _get: function () { return { flc: 52, qty: 1, devType: "inst" }; } });
byId.f_rows.children.push({ _get: function () { return { flc: 27, qty: 1 }; } });
api.calcFeeder();
var tq3 = txt(byId.f_out);
ok(/assumed at 250% of FLC — 430\.62\(A\) Exception/.test(tq3), "N1: assumed-at-percentage basis label rendered");
ok(/with no next-size-up/.test(tq3), "N1: note states the assumed rating gets no next-size-up");
ok(/150 A/.test(tq3) && /rounded down/.test(tq3), "N1: corrected 150 A standard maximum rendered (pre-fix: 175)");
// (vii) locked assumed-rating display is rounded — no raw float noise in the field
byId.f_rows.children.length = 0;
setVals({ f_loc: "surface", f_phase: "3", f_volt: "460", f_dev: "tdfuse" });
fireEl(byId.f_loc, "change");
setVals({ f_volt: "460", f_dev: "tdfuse" });
api.addFeederRow();
var fq2 = byId.f_rows.children[0], gq2 = fq2.children[0];
var qFlc2 = gq2.children[1].children[1], qDev2 = gq2.children[3].children[1], qIn2 = gq2.children[4].children[1];
qFlc2.value = "7.6"; fireEl(qFlc2, "input");
qDev2.value = "inst"; fireEl(qDev2, "change");
ok(qIn2.value === "13.3", "locked assumed field: 7.6×1.75 displays 13.3, not 13.299999999999999", qIn2.value);
byId.f_rows.children.length = 0;
setVals({ f_loc: "surface" }); fireEl(byId.f_loc, "change");
setVals({ f_temp: "75", f_volt: "460", f_dev: "itb" });

// 17p. Known/Possible Errata section (static HTML — checked at source level)
var rawHtml = require("fs").readFileSync("/home/jordanp123/melec/index.html", "utf8");
ok(/Known \/ Possible Errata/.test(rawHtml), "errata: section heading present in About");
ok(/id="errata_list"/.test(rawHtml), "errata: list carries an id for future entries");
ok(/Added Feeder Short Circuit and Ground fault settings for Underground and\s+Surface/.test(rawHtml),
   "errata: feeder SC entry present verbatim");
ok(/Preliminary, not yet verified/.test(rawHtml), "errata: preliminary flag present");
ok(rawHtml.indexOf("errata_list") < rawHtml.indexOf('id="def_list"'),
   "errata: section sits above the definitions in the About flow");

// 17m. About-tab citations gained the feeder entries
var citeTxt = txt(byId.cite_list);
ok(/430\.62/.test(citeTxt), "CITES: modern 430.62 entry present");
ok(/430-62/.test(citeTxt), "CITES: 1968 430-62 entry present");
ok(/430-150/.test(citeTxt), "CITES: 1968 Table 430-150 mentioned");

// ---- 18. VFD (adjustable-speed drives) — NEC 430.122 / 430.130(A) / 430.124 / 430.126

// 18a. vfdConductors pure math (25 HP 460 V: FLC3 table 34 A; drive nameplate 40 A)
var vc = api.vfdConductors(34, 40, false);
ok(vc.input === 50 && vc.output === 42.5 && vc.bypass === null && vc.governs === null,
   "vfdConductors(34,40,false): input 50, output 42.5, no bypass", vc);
vc = api.vfdConductors(34, 40, true);
ok(vc.bypass === 50 && vc.governs === "input", "vfdConductors bypass: max(50,42.5)=50, input governs", vc);
vc = api.vfdConductors(34, 26, true);
ok(vc.input === 32.5 && vc.output === 42.5 && vc.bypass === 42.5 && vc.governs === "output",
   "vfdConductors undersized-input edge: output basis governs the bypass", vc);
vc = api.vfdConductors(NaN, 40, true);
ok(vc.input === 50 && vc.output === null && vc.bypass === null,
   "vfdConductors: no FLC → output/bypass null, input still computed", vc);
vc = api.vfdConductors(34, NaN, false);
ok(vc.input === null && vc.output === 42.5, "vfdConductors: no drive input → input null", vc);

// 18b. smallestCable on the two bases (cu 75 °C: 8 AWG=50 A, 6 AWG=65 A) — exact boundary
var c18 = api.smallestCable(50, "surface", "cu", "75");
ok(c18 && c18.size === "8" && c18.amp === 50, "smallestCable(50) = 8 AWG exactly at its 50 A ampacity", c18);
c18 = api.smallestCable(65, "surface", "cu", "75");
ok(c18 && c18.size === "6", "smallestCable(65) = 6 AWG (input basis for a 52 A drive)", c18);

// 18c. feederAmpacity — 430.24 sum with the 430.122(D) drive-input substitution
var fa = api.feederAmpacity([{ flc: 34, qty: 1 }, { flc: 27, qty: 1 }], "surface");
ok(fa && !fa.anyVfd && Math.abs(fa.req - 69.5) < 1e-9 && fa.count === 2,
   "feederAmpacity ATL identity: 34×1.25+27 = 69.5 (matches pre-refactor inline math)", fa);
fa = api.feederAmpacity([{ flc: 34, qty: 1, ctl: "vfd", driveIn: 40 }, { flc: 27, qty: 1, ctl: "atl" }], "surface");
ok(fa && fa.anyVfd && fa.largest === 40 && Math.abs(fa.req - 77) < 1e-9,
   "feederAmpacity VFD row: drive input 40 replaces FLC 34 → 40×1.25+27 = 77", fa);
fa = api.feederAmpacity([{ flc: 34, qty: 1, ctl: "vfdbp", driveIn: 26 }], "surface");
ok(fa && fa.largest === 34 && Math.abs(fa.req - 42.5) < 1e-9,
   "feederAmpacity VFD+bypass: max(driveIn 26, FLC 34) = 34 enters the sum", fa);
fa = api.feederAmpacity([{ flc: 34, qty: 1, ctl: "vfdbp", driveIn: 40 }, { flc: 27, qty: 1 }], "surface");
ok(fa && fa.largest === 40 && Math.abs(fa.req - 77) < 1e-9,
   "feederAmpacity VFD+bypass with driveIn > FLC: drive input governs", fa);
fa = api.feederAmpacity([{ flc: 34, qty: 2, ctl: "vfd", driveIn: 40 }], "surface");
ok(fa && fa.count === 2 && Math.abs(fa.sumOthers - 40) < 1e-9 && Math.abs(fa.req - 90) < 1e-9,
   "feederAmpacity qty 2 drive row: 40×1.25 + 40 = 90, largest counted once", fa);
fa = api.feederAmpacity([{ flc: 34, qty: 1, ctl: "vfd", driveIn: 40 }], "ug");
ok(fa && !fa.anyVfd && Math.abs(fa.req - 42.5) < 1e-9,
   "feederAmpacity UG leak guard: ctl/driveIn ignored underground → 34×1.25 = 42.5", fa);
fa = api.feederAmpacity([{ flc: 34, qty: 1, ctl: "vfd", driveIn: NaN }, { flc: 27, qty: 1 }], "surface");
ok(fa && fa.missingDriveIn === true && fa.anyVfd === true,
   "feederAmpacity: drive row without input current → missingDriveIn (FLC is not a fallback)", fa);
ok(api.feederAmpacity([], "surface") === null && api.feederAmpacity([{ flc: 0, qty: 1 }], "surface") === null,
   "feederAmpacity: no countable rows → null");

// 18d. calcMotor surface VFD, no bypass (25 HP 460 V, FLC 34, drive input 52)
// (fetch via getElementById — the byId map only materializes ids something has
// already looked up, and calcMotor short-circuits past these in atl mode)
var mBypass = document.getElementById("m_bypass"), mSomcp = document.getElementById("m_somcp");
setVals({ m_loc: "surface", m_phase: "3", m_volt: "460", m_hp: "25", m_flc: "34", m_fla: "",
  m_mat: "cu", m_temp: "75", m_ctype: "other", m_designb: "std",
  m_controller: "vfd", m_drivein: "52" });
mBypass.checked = false; mSomcp.checked = false;
api.calcMotor();
var t18 = txt(byId.m_out);
ok(/Conductors — NEC 430\.122 \(adjustable-speed drive\)/.test(t18), "vfd: 430.122 conductor heading");
ok(!/Conductor & overload \(125% basis\)/.test(t18), "vfd: plain 125% conductor block replaced");
ok(/drive rated input × 125% — NEC 430\.122\(A\)/.test(t18) && /65/.test(t18),
   "vfd: input basis 52×1.25 = 65 A cited to 430.122(A)");
ok(/motor FLC × 125% per 430\.6 — NEC 430\.122\(B\)/.test(t18) && /42\.5/.test(t18),
   "vfd: output basis 34×1.25 = 42.5 A cited to 430.122(B)");
ok(/Minimum input cable/.test(t18) && /6 AWG/.test(t18), "vfd: input cable 6 AWG (65 A basis)");
ok(/Minimum output cable/.test(t18) && /8 AWG/.test(t18), "vfd: output cable 8 AWG (42.5 A basis)");
ok(!/Bypass path basis/.test(t18), "vfd: no bypass row when unchecked");
ok(/430\.130\(A\) \(Table 430\.52\)/.test(t18), "vfd: device heading cites 430.130(A)");
ok(/175% of FLC = 59\.5 A/.test(t18) && /60 A/.test(t18), "vfd: TD fuse 59.5 → 60 A on motor-FLC basis");
ok(/102/.test(t18) && /110 A/.test(t18) && /85/.test(t18) && /90 A/.test(t18) && /136/.test(t18),
   "vfd: NTD 102→110, ITB 85→90, ceil 136 — all on FLC basis (no SOMCP)");
ok(/must not be exceeded/.test(t18) && /Semiconductor fuses/.test(t18),
   "vfd: 430.130(A) marked-maximum + semiconductor-fuse notes");
ok(/instantaneous-trip circuit breaker \(NEC Table 430\.52, per 430\.130\(A\)\)/.test(t18)
   && /272/.test(t18) && /442/.test(t18), "vfd: instantaneous block kept — 800%/1300% of FLC 34 = 272/442");
ok(/Running overload — provided by the drive \(NEC 430\.124\)/.test(t18)
   && !/Running overload \(Type-FH heater\)/.test(t18), "vfd: heater block replaced by 430.124(A) note");
ok(/Motor starter — replaced by the drive/.test(t18)
   && !/Motor starter \(minimum NEMA size\)/.test(t18), "vfd: starter block replaced");
ok(/430\.126/.test(t18) && /overtemperature/.test(t18), "vfd: 430.126 overtemperature note present");

// 18e. bypass checked: worst-case conductor basis + heater/starter return for the bypass path
mBypass.checked = true;
api.calcMotor();
var t18b = txt(byId.m_out);
ok(/Bypass path basis/.test(t18b) && /drive input × 125% governs/.test(t18b) && /430\.122\(C\)/.test(t18b),
   "vfd bypass: max(65, 42.5) row present, input governs, cited to 430.122(C)");
ok(/shared with the bypass/.test(t18b), "vfd bypass: shared-conductor cable row present");
ok(/Running overload — bypass path \(Type-FH heater, NEC 430\.124\(B\)\)/.test(t18b),
   "vfd bypass: heater block rendered for the bypass path");
ok(/Bypass contactor \(minimum NEMA size\)/.test(t18b) && /NEMA Size 2/.test(t18b),
   "vfd bypass: contactor sized as an across-the-line starter (25 HP 460 V → Size 2)");

// 18f. SOMCP marking: device basis switches to drive input (52), conductor note appears
mBypass.checked = false; mSomcp.checked = true;
api.calcMotor();
var t18s = txt(byId.m_out);
ok(/175% of drive input = 91 A/.test(t18s) && /100 A/.test(t18s),
   "somcp: TD fuse basis 52 → 91 → 100 A, labeled 'drive input'");
ok(/156/.test(t18s) && /175 A/.test(t18s) && /130/.test(t18s) && /150 A/.test(t18s) && /208/.test(t18s),
   "somcp: NTD 156→175, ITB 130→150, ceil 208 on drive-input basis");
ok(/416/.test(t18s) && /676/.test(t18s) && /% of drive input/.test(t18s),
   "somcp: instantaneous 800%/1300% of 52 = 416/676, column relabeled");
ok(/used instead, as 430\.130\(A\) permits/.test(t18s), "somcp: note names the basis switch");
ok(/Suitable for Output Motor Conductor Protection/.test(t18s) && /marked size is not computable/.test(t18s),
   "somcp: output-conductor marked-minimum note present");
mSomcp.checked = false;

// 18g. underground regression: poisoned VFD state must not leak into the 1968-NEC path
setVals({ m_loc: "ug", m_phase: "3", m_volt: "460", m_flc: "124", m_ctype: "other",
  m_cable: "pp:6", m_amb: "20", m_temp: "90", m_controller: "vfd", m_drivein: "52" });
mBypass.checked = true; mSomcp.checked = true;
fireEl(byId.m_loc, "change");
ok(byId.m_controller_field.hidden === true && byId.m_vfd.hidden === true,
   "ug: controller field and VFD subgrid hidden on location change");
api.calcMotor();
var t18u = txt(byId.m_out);
ok(!/430\.12/.test(t18u) && !/430\.130/.test(t18u) && !/drive/.test(t18u),
   "ug: zero drive/430.122/430.130 text with controller still set to vfd");
ok(/magnetic circuit breaker/.test(t18u) && /FLC × 700%/.test(t18u) && /868/.test(t18u) && /1,612/.test(t18u),
   "ug: 700%/1300% magnetic band intact (868/1,612 for FLC 124)");
ok(/Running overload \(Type-FH heater\)/.test(t18u) && /Motor starter \(minimum NEMA size\)/.test(t18u),
   "ug: heater and starter blocks unchanged");
setVals({ m_loc: "surface" }); fireEl(byId.m_loc, "change");
ok(byId.m_controller_field.hidden === false && byId.m_vfd.hidden === false,
   "surface return: controller field back, subgrid visible again (select kept its vfd value)");
mBypass.checked = false; mSomcp.checked = false;

// 18h. missing drive input: hard stop with a 430.122(A) callout, no conductor rows
setVals({ m_loc: "surface", m_flc: "34", m_controller: "vfd", m_drivein: "" });
api.calcMotor();
var t18m = txt(byId.m_out);
ok(/rated input current/.test(t18m) && !/Conductors — NEC 430\.122/.test(t18m),
   "vfd: missing drive input → callout, calculation stops");
setVals({ m_controller: "atl", m_drivein: "" });

// 18i. calcFeeder end-to-end: VFD row (FLC 34, drive input 40) + ATL row (27), surface itb
byId.f_rows.children.length = 0;
setVals({ f_loc: "surface" }); fireEl(byId.f_loc, "change");
setVals({ f_phase: "3", f_volt: "460", f_dev: "itb", f_mat: "cu", f_temp: "75" });
api.addFeederRow(); api.addFeederRow();
var f18a = byId.f_rows.children[0].children[0], f18b = byId.f_rows.children[1].children[0];
var aFlc = f18a.children[1].children[1], aCtl = f18a.children[5].children[1], aDrv = f18a.children[6].children[1];
var bFlc = f18b.children[1].children[1];
aFlc.value = "34"; fireEl(aFlc, "input");
aCtl.value = "vfd"; fireEl(aCtl, "change");
ok(aDrv.disabled === false, "feeder row: drive-input field enabled on VFD selection");
aDrv.value = "40";
bFlc.value = "27"; fireEl(bFlc, "input");
api.calcFeeder();
var tf18 = txt(byId.f_out);
ok(/required feeder ampacity/.test(tf18) && /77/.test(tf18),
   "feeder vfd: 40×1.25+27 = 77 A required ampacity");
ok(/Largest contribution/.test(tf18) && /430\.122\(D\)/.test(tf18),
   "feeder vfd: largest row relabeled with the 430.122(D) basis");
ok(/Minimum feeder cable/.test(tf18) && /4 AWG/.test(tf18), "feeder vfd: 77 A → 4 AWG (85 A, cu 75 °C)");
ok(/\(VFD\)/.test(tf18), "feeder vfd: branch table tags the drive row");
ok(/430\.130\(A\)/.test(tf18), "feeder vfd: auto branch basis cites 430.130(A)");
ok(/110 A/.test(tf18) && /rounded down/.test(tf18),
   "feeder vfd 430.62 on motor FLC: 90 (itb on 34) + 27 = 117 → 110 std");
ok(/deliberate literal reading/.test(tf18), "feeder vfd: 430.62 literal-reading note present");

// 18j. missing drive input on a feeder row: ampacity blocked, 430.62 still renders
aDrv.value = "";
api.calcFeeder();
var tf18m = txt(byId.f_out);
ok(/drive rated input current/.test(tf18m) && !/required feeder ampacity/.test(tf18m),
   "feeder vfd: missing drive input → callout replaces the ampacity block");
ok(/Branch-circuit devices feeding the 430\.62 computation/.test(tf18m) && /110 A/.test(tf18m),
   "feeder vfd: 430.62 device section unaffected by the missing drive input");

// 18k. location-switch reset: UG rebuild drops the row to across-the-line and clears the input
aDrv.value = "40";
setVals({ f_loc: "ug" }); fireEl(byId.f_loc, "change");
ok(aCtl.value === "atl", "ug switch: controller reset to across-the-line");
ok(aDrv.value === "" && aDrv.disabled === true, "ug switch: drive input cleared and disabled");
api.calcFeeder();
var tf18u = txt(byId.f_out);
ok(/69\.5/.test(tf18u) && !/Largest contribution/.test(tf18u) && !/430\.122/.test(tf18u),
   "ug feeder: plain 1968-NEC sum 34×1.25+27 = 69.5, zero drive text");
setVals({ f_loc: "surface" }); fireEl(byId.f_loc, "change");
ok(aCtl.value === "atl" && aDrv.value === "", "surface return: old VFD choice does not resurrect");
byId.f_rows.children.length = 0;
setVals({ f_temp: "75", f_volt: "460", f_dev: "itb" });

// 18l. static + about-tab checks
var rawHtml18 = require("fs").readFileSync("/home/jordanp123/melec/index.html", "utf8");
ok(/id="m_controller"/.test(rawHtml18) && /id="m_drivein"/.test(rawHtml18)
   && /id="m_bypass"/.test(rawHtml18) && /id="m_somcp"/.test(rawHtml18),
   "static: motor-tab VFD field ids present");
ok(/Added VFD \(adjustable-speed drive\) support/.test(rawHtml18)
   && /Preliminary, not field-verified/.test(rawHtml18), "static: dated errata entry present");
var citeTxt18 = txt(byId.cite_list);
ok(/Part X — Adjustable-Speed Drive Systems/.test(citeTxt18), "CITES: Part X entry present");
ok(/430\.122\(D\)/.test(citeTxt18) && /430\.126/.test(citeTxt18) && /430\.130\(A\)/.test(citeTxt18),
   "CITES: 430.122(D)/430.126/430.130(A) covered");
ok(/no drive-input substitution/.test(citeTxt18), "CITES: 430.62 literal reading documented");
var defTxt18 = txt(byId.def_list);
ok(/Drive rated input current/.test(defTxt18) && /VFD conductor bases — NEC 430\.122/.test(defTxt18),
   "DEFS: drive definitions present");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
