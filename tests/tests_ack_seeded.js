// Run with ACK_SEED=1 — simulates a page load later in the same browsing session,
// after the user already clicked "I acknowledge" (sessionStorage flag pre-set).
const { api, byId, document } = require("./harness.js");
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra)); }
}
function findAck() { return document.body.children.filter(function (c) { return c.className === "ack-overlay"; }); }

ok(process.env.ACK_SEED === "1", "run with ACK_SEED=1");
ok(findAck().length === 0, "seeded session: no overlay at script load", findAck().length);
api.init();
ok(findAck().length === 0, "seeded session: still no overlay after init()", findAck().length);

// the app itself is fully functional without the dialog ever having existed this load
document.getElementById("o_flc").value = "41.5";
document.getElementById("o_size").value = "2";
document.getElementById("o_comp").value = "non";
document.getElementById("o_encl").value = "open";
document.getElementById("o_pole").value = "block3";
api.calcOverload();
ok(/FH56/.test(byId.o_out.textContent), "seeded session: calculators work normally");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
