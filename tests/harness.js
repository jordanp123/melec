const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync("/home/jordanp123/melec/index.html", "utf8");
let code = src.match(/<script>([\s\S]*?)<\/script>/)[1];

// expose internals just before the IIFE closes
const EXPORTS = `
globalThis.__api={$:$,init:init,calcMotor:calcMotor,calcFeeder:calcFeeder,
 parseUgSpec:parseUgSpec,ugAmpList:ugAmpList,ugSpecLabel:ugSpecLabel,ugTableName:ugTableName,
 smallestCable:smallestCable,trailCap:trailCap,iceaPPAmp:iceaPPAmp,iceaMPAmp:iceaMPAmp,
 surfaceAmp:surfaceAmp,addFeederRow:addFeederRow,
 ICEA_PP_COLS:ICEA_PP_COLS,ICEA_MP_COLS:ICEA_MP_COLS,ICEA_A4:ICEA_A4,ICEA_SIZES:ICEA_SIZES,
 ICEA_AMB_CORR:ICEA_AMB_CORR,ICEA_DEFAULT_COL:ICEA_DEFAULT_COL,ICEA_DEFAULT_AMB:ICEA_DEFAULT_AMB,
 UG_AMB_OPTS:UG_AMB_OPTS,TRAIL_SC:TRAIL_SC,
 selectHeater:selectHeater,heaterRows:heaterRows,nextUpRow:nextUpRow,
 nextStdFuse:nextStdFuse,FUSE_SIZES:FUSE_SIZES,nextStd:nextStd,STD_SIZES:STD_SIZES,
 smallestTrailingCable:smallestTrailingCable,trailSizes:trailSizes,
 calcOverload:calcOverload,calcTrip:calcTrip,fillTripSize:fillTripSize,
 TRIP_A:TRIP_A,TRIP_B:TRIP_B,FH_AB:FH_AB,FH_34:FH_34,FH_CT5:FH_CT5,FH_CT6:FH_CT6,
 ICEA_A1:ICEA_A1,ICEA_A2:ICEA_A2,ICEA_A3:ICEA_A3,ICEA_A5:ICEA_A5,ICEA_A6:ICEA_A6,TABS:TABS,
 feederSC:feederSC,branchDevRating:branchDevRating,FEEDER_DEV:FEEDER_DEV,feederTripPicks:feederTripPicks,
 FLC68:FLC68,V68:V68,lookupFLC68:lookupFLC68,lookupFLC:lookupFLC,FLC3:FLC3,FLC1:FLC1,
 prevStd:prevStd,prevStdFuse:prevStdFuse,
 vfdConductors:vfdConductors,feederAmpacity:feederAmpacity};
`;
const i = code.lastIndexOf("})();");
if (i < 0) throw new Error("IIFE tail not found");
code = code.slice(0, i) + EXPORTS + code.slice(i);

// ---------------- DOM stub ----------------
function mkEl(tag) {
  const e = {
    tagName: String(tag).toUpperCase(), children: [], attrs: {}, _text: "",
    className: "", value: undefined, hidden: false, disabled: false,
    style: {}, _listeners: {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const k = this.children.indexOf(c); if (k >= 0) this.children.splice(k, 1); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === "value") this.value = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    hasAttribute(k) { return k in this.attrs; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    focus() {}, click() { (this._listeners.click || []).forEach(f => f.call(this, {})); },
    classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; }
    },
    get firstChild() { return this.children[0] || null; },
    get textContent() {
      if (this.children.length === 0) return this._text;
      return this.children.map(c => c.textContent === undefined ? "" : c.textContent).join("");
    },
    set textContent(v) { this._text = String(v); this.children = []; }
  };
  return e;
}
const byId = {};
const document = {
  readyState: "complete",
  documentElement: mkEl("html"),
  body: mkEl("body"),
  createElement: mkEl,
  createTextNode(t) { const e = mkEl("#text"); e._text = String(t); return e; },
  createDocumentFragment() { return mkEl("#fragment"); },
  getElementById(id) { return byId[id] || (byId[id] = mkEl("div")); },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const _ss = {};
if (process.env.ACK_SEED === "1") _ss["melecAck"] = "1";
const sessionStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(_ss, k) ? _ss[k] : null; },
  setItem(k, v) { _ss[k] = String(v); },
  removeItem(k) { delete _ss[k]; }
};
const window = {
  matchMedia() { return { matches: false, addEventListener() {} }; },
  print() {}, addEventListener() {},
  localStorage: { getItem() { return null; }, setItem() {} },
  sessionStorage,
  location: { href: "file:///x.html", protocol: "file:" }
};
const ctx = vm.createContext({
  document, window, localStorage: window.localStorage, sessionStorage, location: window.location,
  navigator: { userAgent: "node" }, console, Math, JSON, Date, isFinite, parseFloat, parseInt, Number, String, Array, Object, RegExp, Error
});
ctx.globalThis = ctx;
vm.runInContext(code, ctx, { filename: "app.js" });
module.exports = { api: ctx.__api, byId, document, mkEl, ss: _ss };
