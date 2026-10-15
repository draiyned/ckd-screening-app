/* Navigation, Dashboard, Monitoring, Forecasting, Referral and Dialysis Centers.
   Depends on script.js (API_BASE, loadJSON, saveJSON) and centers.js (PARTNER_CENTERS). */
(function () {
  "use strict";

  const TABS = ["home", "dashboard", "monitoring", "forecasting", "referral", "centers", "about"];
  const API = typeof API_BASE !== "undefined" ? API_BASE : "https://ckd-screening-app.vercel.app/api";
  const LOG_KEY = "ckd_log_v1";
  const DAY = 86400000;
  const YEAR = 365.25 * DAY;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, text, cls) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }

  function todayISO() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function isoToTime(iso) {
    const p = String(iso).split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).getTime();
  }
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(t, withYear) {
    const d = new Date(t);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}${withYear ? ", " + d.getFullYear() : ""}`;
  }
  function fmtMonth(t) {
    const d = new Date(t);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  /* ---------------- Router and menu ---------------- */
  const onEnter = {};

  function showTab(name) {
    if (!TABS.includes(name)) name = "home";
    $$(".tab-section").forEach((s) => s.classList.toggle("active", s.id === "tab-" + name));
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    closeMenu();
    if (onEnter[name]) onEnter[name]();
  }

  function route() {
    const h = location.hash.replace("#", "");
    if (h === "screening") {
      showTab("home");
      const target = $("#screening");
      if (target) target.scrollIntoView();
      return;
    }
    showTab(h || "home");
    window.scrollTo(0, 0);
  }

  function go(name) {
    if (location.hash === "#" + name) route();
    else location.hash = name;
  }

  window.addEventListener("hashchange", route);

  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (b) go(b.dataset.go);
  });

  const sidebar = $("#sidebar");
  const scrim = $("#scrim");
  const menuBtn = $("#menu-btn");
  function openMenu() {
    sidebar.classList.add("open");
    scrim.classList.add("show");
    menuBtn.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    sidebar.classList.remove("open");
    scrim.classList.remove("show");
    menuBtn.setAttribute("aria-expanded", "false");
  }
  menuBtn.addEventListener("click", () => (sidebar.classList.contains("open") ? closeMenu() : openMenu()));
  scrim.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  $("#hero-start").addEventListener("click", () => go("screening"));
  $("#hero-chat").addEventListener("click", () => {
    const fab = document.getElementById("ckd-fab");
    if (fab) fab.click();
  });

  /* ---------------- Charts ---------------- */
  function niceTicks(min, max, n) {
    const span = max - min || 1;
    const raw = span / (n || 4);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = start; v <= end + step * 0.001; v += step) ticks.push(+v.toFixed(6));
    return ticks;
  }

  function emptyChart(box, msg) {
    box.innerHTML = "";
    box.appendChild(el("div", msg, "empty"));
  }

  /* cfg: { series:[{cls, ptcls, points:[{t,v,tip}], dots}], thresholds:[{v}], label } */
  function lineChart(box, cfg) {
    const all = [];
    cfg.series.forEach((s) => s.points.forEach((p) => all.push(p)));
    if (!all.length) return emptyChart(box, cfg.empty || "No readings yet.");

    const W = 600, H = 240, L = 40, R = 14, T = 12, B = 30;
    let tMin = Math.min(...all.map((p) => p.t));
    let tMax = Math.max(...all.map((p) => p.t));
    if (tMax - tMin < DAY) { tMin -= 3 * DAY; tMax += 3 * DAY; }

    const vals = all.map((p) => p.v).concat((cfg.thresholds || []).map((x) => x.v));
    const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 4);
    const yMin = ticks[0], yMax = ticks[ticks.length - 1];

    const x = (t) => L + ((t - tMin) / (tMax - tMin)) * (W - L - R);
    const y = (v) => T + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - T - B);
    const longSpan = tMax - tMin > 1.5 * YEAR;

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${cfg.label || "Chart"}">`;
    ticks.forEach((v) => {
      svg += `<line class="ax" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="ax-text" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    });
    for (let i = 0; i < 4; i++) {
      const t = tMin + ((tMax - tMin) * i) / 3;
      const anchor = i === 0 ? "start" : i === 3 ? "end" : "middle";
      svg += `<text class="ax-text" x="${x(t)}" y="${H - 8}" text-anchor="${anchor}">${longSpan ? fmtMonth(t) : fmtDate(t)}</text>`;
    }
    (cfg.thresholds || []).forEach((th) => {
      svg += `<line class="ln-thr" x1="${L}" x2="${W - R}" y1="${y(th.v)}" y2="${y(th.v)}"/>`;
    });
    cfg.series.forEach((s) => {
      if (!s.points.length) return;
      const pts = s.points.slice().sort((a, b) => a.t - b.t);
      if (pts.length > 1) {
        svg += `<polyline class="ln ${s.cls}" points="${pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}"/>`;
      }
      if (s.dots !== false) {
        pts.forEach((p) => {
          svg += `<circle class="${s.ptcls}" cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4"><title>${p.tip || ""}</title></circle>`;
        });
      }
    });
    svg += "</svg>";
    box.innerHTML = svg;
  }

  function barChart(box, items) {
    const W = 600, H = 220, L = 30, R = 10, T = 18, B = 30;
    const max = Math.max(1, ...items.map((i) => i.count));
    const ticks = niceTicks(0, max, 4);
    const top = ticks[ticks.length - 1] || 1;
    const slot = (W - L - R) / items.length;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Screenings per week">`;
    ticks.forEach((v) => {
      const yy = T + (1 - v / top) * (H - T - B);
      svg += `<line class="ax" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>`;
      svg += `<text class="ax-text" x="${L - 6}" y="${yy + 4}" text-anchor="end">${v}</text>`;
    });
    items.forEach((it, i) => {
      const h = (it.count / top) * (H - T - B);
      const bx = L + i * slot + slot * 0.18;
      const bw = slot * 0.64;
      const by = H - B - h;
      svg += `<rect class="wk-bar" x="${bx}" y="${by}" width="${bw}" height="${Math.max(h, 0)}" rx="4"><title>${it.label}: ${it.count}</title></rect>`;
      if (it.count > 0) svg += `<text class="ax-text" x="${bx + bw / 2}" y="${by - 4}" text-anchor="middle">${it.count}</text>`;
      svg += `<text class="ax-text" x="${bx + bw / 2}" y="${H - 10}" text-anchor="middle">${it.label}</text>`;
    });
    svg += "</svg>";
    box.innerHTML = svg;
  }

  /* ---------------- Dashboard ---------------- */
  let statsCache = { at: 0, data: null };

  async function loadStats() {
    const note = $("#dash-state");
    if (statsCache.data && Date.now() - statsCache.at < 60000) return renderStats(statsCache.data);

    note.textContent = "Loading statistics...";
    note.className = "notice notice-info";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(`${API}/stats`, { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      statsCache = { at: Date.now(), data };
      note.className = "notice hidden";
      renderStats(data);
    } catch (err) {
      note.textContent = "Could not load the statistics. The server may be waking up. Open this page again in a moment.";
      note.className = "notice notice-warn";
      console.error(err);
    } finally {
      clearTimeout(timer);
    }
  }

  function renderStats(d) {
    $("#st-total").textContent = d.total;
    $("#st-low").textContent = d.by_risk.low;
    $("#st-moderate").textContent = d.by_risk.moderate;
    $("#st-high").textContent = d.by_risk.high;
    $("#st-appts").textContent = d.appointments;

    const rows = $("#chart-risk");
    rows.innerHTML = "";
    const top = Math.max(1, d.by_risk.low, d.by_risk.moderate, d.by_risk.high);
    ["low", "moderate", "high"].forEach((k) => {
      const n = d.by_risk[k];
      const pct = d.total ? Math.round((n / d.total) * 100) : 0;
      const row = el("div", null, "bar-row");
      row.appendChild(el("span", k[0].toUpperCase() + k.slice(1)));
      const track = el("div", null, "bar-track");
      const fill = el("div", null, "bar-fill " + k);
      fill.style.width = (n / top) * 100 + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("span", `${n} (${pct}%)`, "bar-val"));
      rows.appendChild(row);
    });

    barChart(
      $("#chart-weekly"),
      d.weekly.map((w) => ({ label: fmtDate(isoToTime(w.week)), count: w.count }))
    );
  }

  function renderHistory() {
    const box = $("#my-history");
    box.innerHTML = "";
    const hist = loadJSON("ckd_history", []).slice().reverse();
    if (!hist.length) {
      box.appendChild(el("p", "No screenings on this device yet. Take the screening on the Home page.", "empty-row"));
      return;
    }
    hist.forEach((h) => {
      const row = el("div", null, "hist-item");
      row.appendChild(el("span", fmtDate(new Date(h.date).getTime(), true)));
      const right = el("span");
      right.appendChild(el("span", h.level, "pill " + h.level));
      right.appendChild(document.createTextNode(`  ${(h.score * 100).toFixed(1)}%`));
      row.appendChild(right);
      box.appendChild(row);
    });
  }

  $("#clear-history").addEventListener("click", () => {
    if (!confirm("Remove your saved screening results from this device?")) return;
    saveJSON("ckd_history", []);
    renderHistory();
  });

  onEnter.dashboard = function () {
    renderHistory();
    loadStats();
  };

  /* ---------------- Monitoring ---------------- */
  function getLog() {
    const raw = loadJSON(LOG_KEY, []);
    return raw
      .filter((r) => r && typeof r.date === "string")
      .sort((a, b) => isoToTime(a.date) - isoToTime(b.date));
  }
  function setLog(list) {
    saveJSON(LOG_KEY, list);
  }

  const logForm = $("#log-form");
  const logError = $("#log-error");
  logForm.elements["date"].value = todayISO();

  function logProblem(msg) {
    logError.textContent = msg;
    logError.classList.toggle("hidden", !msg);
  }

  logForm.addEventListener("submit", (e) => {
    e.preventDefault();
    logProblem("");
    const f = logForm.elements;
    const date = f["date"].value;
    if (!date) return logProblem("Choose a date.");
    if (isoToTime(date) > isoToTime(todayISO())) return logProblem("The date cannot be in the future.");

    const entry = { id: Date.now(), date };

    const bp = f["bp"].value.trim();
    if (bp) {
      const m = bp.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
      if (!m) return logProblem("Write blood pressure like 120/80.");
      const sys = +m[1], dia = +m[2];
      if (sys < 60 || sys > 260 || dia < 30 || dia > 160 || dia >= sys) return logProblem("That blood pressure looks wrong. Check the numbers.");
      entry.sys = sys;
      entry.dia = dia;
    }
    const num = (name, lo, hi, label) => {
      const raw = f[name].value.trim();
      if (!raw) return true;
      const v = parseFloat(raw);
      if (!isFinite(v) || v < lo || v > hi) {
        logProblem(`${label} should be between ${lo} and ${hi}.`);
        return false;
      }
      entry[name] = v;
      return true;
    };
    if (!num("weight", 10, 400, "Weight")) return;
    if (!num("egfr", 1, 200, "eGFR")) return;
    if (!num("creat", 0.1, 30, "Creatinine")) return;

    if (entry.sys === undefined && entry.weight === undefined && entry.egfr === undefined && entry.creat === undefined) {
      return logProblem("Enter at least one reading.");
    }
    const note = f["note"].value.trim();
    if (note) entry.note = note.slice(0, 80);

    const list = getLog();
    list.push(entry);
    setLog(list);
    logForm.reset();
    f["date"].value = todayISO();
    renderMonitoring();
  });

  $("#log-clear").addEventListener("click", () => {
    if (!getLog().length) return;
    if (!confirm("Delete every reading in your log? This cannot be undone.")) return;
    setLog([]);
    renderMonitoring();
  });

  $("#log-export").addEventListener("click", () => {
    const list = getLog();
    if (!list.length) return;
    const safe = (s) => {
      let v = String(s === undefined ? "" : s);
      if (/^[=+\-@]/.test(v)) v = "'" + v;
      return `"${v.replace(/"/g, '""')}"`;
    };
    const lines = ["Date,Systolic,Diastolic,Weight_kg,eGFR,Creatinine,Note"];
    list.forEach((r) => lines.push([r.date, r.sys, r.dia, r.weight, r.egfr, r.creat, safe(r.note)].map((v) => (v === undefined ? "" : v)).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ckd-monitoring-log.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  function latest(list, key) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i][key] !== undefined) return list[i];
    return null;
  }

  function stageOf(v) {
    if (v >= 90) return "G1";
    if (v >= 60) return "G2";
    if (v >= 45) return "G3a";
    if (v >= 30) return "G3b";
    if (v >= 15) return "G4";
    return "G5";
  }

  function renderFlags(list) {
    const box = $("#log-flags");
    box.innerHTML = "";
    const add = (cls, text) => box.appendChild(el("div", text, "flag " + cls));

    const bp = latest(list, "sys");
    if (bp) {
      if (bp.sys >= 180 || bp.dia >= 120) add("bad", `Latest blood pressure ${bp.sys}/${bp.dia} is very high. If you have chest pain, a bad headache, trouble breathing, or confusion, go to an emergency room now. Otherwise, call a doctor today.`);
      else if (bp.sys >= 140 || bp.dia >= 90) add("warn", `Latest blood pressure ${bp.sys}/${bp.dia} is high (140/90 or above). Book a checkup to review it.`);
      else if (bp.sys >= 130 || bp.dia >= 80) add("warn", `Latest blood pressure ${bp.sys}/${bp.dia} is a little above the ideal 120/80. Mention it at your next checkup.`);
      else add("ok", `Latest blood pressure ${bp.sys}/${bp.dia} is in a healthy range.`);
    }
    const eg = latest(list, "egfr");
    if (eg) {
      if (eg.egfr < 15) add("bad", `Latest eGFR ${eg.egfr} is very low. See a kidney doctor as soon as possible.`);
      else if (eg.egfr < 60) add("warn", `Latest eGFR ${eg.egfr} is below 60. See a doctor for review. One reading does not diagnose CKD, but it needs follow-up.`);
      else add("ok", `Latest eGFR ${eg.egfr} is 60 or above.`);
    }
    const w = list.filter((r) => r.weight !== undefined);
    if (w.length >= 2) {
      const a = w[w.length - 2], b = w[w.length - 1];
      const days = (isoToTime(b.date) - isoToTime(a.date)) / DAY;
      if (days > 0 && days <= 14 && b.weight - a.weight >= 2) {
        add("warn", `Your weight rose ${(b.weight - a.weight).toFixed(1)} kg in ${days} day(s). Fast weight gain can mean fluid is building up. Tell your doctor.`);
      }
    }
  }

  function renderTable(list) {
    const t = $("#log-table");
    t.innerHTML = "";
    if (!list.length) {
      const tr = el("tr");
      const td = el("td", "No readings yet. Add your first one above.", "empty-row");
      td.colSpan = 7;
      tr.appendChild(td);
      t.appendChild(tr);
      return;
    }
    const head = el("tr");
    ["Date", "BP", "Weight", "eGFR", "Creatinine", "Note", ""].forEach((h) => head.appendChild(el("th", h)));
    t.appendChild(head);
    list.slice().reverse().forEach((r) => {
      const tr = el("tr");
      tr.appendChild(el("td", fmtDate(isoToTime(r.date), true)));
      tr.appendChild(el("td", r.sys !== undefined ? `${r.sys}/${r.dia}` : "–"));
      tr.appendChild(el("td", r.weight !== undefined ? r.weight + " kg" : "–"));
      tr.appendChild(el("td", r.egfr !== undefined ? r.egfr : "–"));
      tr.appendChild(el("td", r.creat !== undefined ? r.creat : "–"));
      tr.appendChild(el("td", r.note || ""));
      const del = el("td");
      const b = el("button", "×", "x");
      b.type = "button";
      b.setAttribute("aria-label", "Delete this reading");
      b.addEventListener("click", () => {
        setLog(getLog().filter((x) => x.id !== r.id));
        renderMonitoring();
      });
      del.appendChild(b);
      tr.appendChild(del);
      t.appendChild(tr);
    });
  }

  function renderMonitoring() {
    const list = getLog();
    renderFlags(list);
    renderTable(list);

    const sysPts = list.filter((r) => r.sys !== undefined).map((r) => ({ t: isoToTime(r.date), v: r.sys, tip: `${r.date}: ${r.sys}/${r.dia}` }));
    const diaPts = list.filter((r) => r.sys !== undefined).map((r) => ({ t: isoToTime(r.date), v: r.dia, tip: `${r.date}: ${r.sys}/${r.dia}` }));
    lineChart($("#chart-bp"), {
      label: "Blood pressure over time",
      empty: "Add a blood pressure reading to see the chart.",
      series: [
        { cls: "ln-blue", ptcls: "pt-blue", points: sysPts },
        { cls: "ln-teal", ptcls: "pt-teal", points: diaPts },
      ],
      thresholds: sysPts.length ? [{ v: 140 }, { v: 90 }] : [],
    });

    const egPts = list.filter((r) => r.egfr !== undefined).map((r) => ({ t: isoToTime(r.date), v: r.egfr, tip: `${r.date}: eGFR ${r.egfr}` }));
    lineChart($("#chart-egfr"), {
      label: "eGFR over time",
      empty: "Add an eGFR reading to see the chart.",
      series: [{ cls: "ln-blue", ptcls: "pt-blue", points: egPts }],
      thresholds: egPts.length ? [{ v: 60 }] : [],
    });
  }

  onEnter.monitoring = renderMonitoring;

  /* ---------------- Forecasting ---------------- */
  function renderForecast() {
    const list = getLog().filter((r) => r.egfr !== undefined);
    const empty = $("#fc-empty");
    const body = $("#fc-body");

    const first = list.length ? isoToTime(list[0].date) : 0;
    const last = list.length ? isoToTime(list[list.length - 1].date) : 0;
    if (list.length < 2 || last - first < DAY) {
      empty.classList.remove("hidden");
      body.classList.add("hidden");
      return;
    }
    empty.classList.add("hidden");
    body.classList.remove("hidden");

    // Straight-line fit: eGFR = a + b * years
    const xs = list.map((r) => (isoToTime(r.date) - first) / YEAR);
    const ys = list.map((r) => r.egfr);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) * (xs[i] - mx);
    }
    const slope = den ? num / den : 0;

    const lastVal = ys[n - 1];
    const at = (years) => Math.max(0, Math.min(150, lastVal + slope * years));

    $("#fc-latest").textContent = lastVal;
    $("#fc-stage").textContent = "Stage " + stageOf(lastVal);
    $("#fc-slope").textContent = (slope > 0 ? "+" : "") + slope.toFixed(1);
    [1, 3, 5].forEach((y) => {
      const v = at(y);
      $("#fc-" + y + "y").textContent = `${Math.round(v)} (${stageOf(v)})`;
    });

    const proj = [], ref = [];
    for (let y = 0; y <= 5; y++) {
      const t = last + y * YEAR;
      proj.push({ t, v: at(y), tip: `${fmtMonth(t)}: about ${Math.round(at(y))}` });
      ref.push({ t, v: Math.max(0, lastVal - y), tip: `${fmtMonth(t)}: about ${Math.max(0, Math.round(lastVal - y))}` });
    }
    const real = list.map((r) => ({ t: isoToTime(r.date), v: r.egfr, tip: `${r.date}: ${r.egfr}` }));

    lineChart($("#chart-fc"), {
      label: "eGFR readings and projection",
      series: [
        { cls: "ln-ref", ptcls: "", points: ref, dots: false },
        { cls: "ln-proj", ptcls: "", points: proj, dots: false },
        { cls: "ln-blue", ptcls: "pt-blue", points: real },
      ],
      thresholds: [{ v: 60 }],
    });

    // Plain-language summary
    let msg;
    if (lastVal < 60) {
      msg = `Your latest eGFR is already below 60. Please see a doctor for review. A trend line cannot replace that.`;
    } else if (slope <= -5) {
      msg = `Your eGFR is falling about ${Math.abs(slope).toFixed(1)} per year. A drop of more than 5 per year is considered fast. Please see a doctor soon.`;
    } else if (slope < -0.05) {
      const yrs = (lastVal - 60) / -slope;
      msg = yrs <= 50
        ? `At this pace, your eGFR would reach 60 in about ${yrs.toFixed(1)} years (around ${new Date(last + yrs * YEAR).getFullYear()}). Keep checking with your doctor.`
        : `At this pace, your eGFR would stay above 60 for more than 50 years.`;
    } else {
      msg = `Your readings are steady or rising. Keep up your checkups.`;
    }
    $("#fc-summary").textContent = msg;

    const months = Math.max(1, Math.round((last - first) / (DAY * 30.44)));
    const weak = n < 3 || last - first < 90 * DAY;
    $("#fc-conf").textContent = weak
      ? `Very low confidence: only ${n} readings over ${months} month(s). A short time span exaggerates the trend. Add more readings over 3 months or longer. Lab-to-lab differences alone can move a reading by several points.`
      : months < 12
        ? `Based on ${n} readings over ${months} months. Under a year of data can exaggerate the trend. Treat it as a rough guide only.`
        : `Based on ${n} readings over ${months} months. Treat it as a rough guide only.`;
  }

  onEnter.forecasting = renderForecast;

  /* ---------------- Referral ---------------- */
  function buildSummary() {
    const last = loadJSON("ckd_last", null);
    const log = getLog();
    const lines = ["CKD screening summary (not a diagnosis)"];
    let any = false;

    if (last) {
      any = true;
      lines.push(`Name: ${last.name || "-"}`);
      lines.push(`Screening date: ${fmtDate(new Date(last.date).getTime(), true)}`);
      lines.push(`Screening result: ${last.level} risk (${(last.score * 100).toFixed(1)}%)`);
    }
    const bp = latest(log, "sys");
    if (bp) { any = true; lines.push(`Latest blood pressure: ${bp.sys}/${bp.dia} (${bp.date})`); }
    const wt = latest(log, "weight");
    if (wt) { any = true; lines.push(`Latest weight: ${wt.weight} kg (${wt.date})`); }
    const eg = latest(log, "egfr");
    if (eg) { any = true; lines.push(`Latest eGFR: ${eg.egfr} (${eg.date})`); }
    const cr = latest(log, "creat");
    if (cr) { any = true; lines.push(`Latest serum creatinine: ${cr.creat} (${cr.date})`); }

    if (!any) return "Nothing saved on this device yet.\nTake the screening on the Home page, or add readings in Monitoring.";
    lines.push("Generated by the CKD Screening tool. A screening aid only.");
    return lines.join("\n");
  }

  function renderReferral() {
    $("#ref-summary").textContent = buildSummary();
    const last = loadJSON("ckd_last", null);
    const f = $("#referral-form").elements;
    if (last) {
      if (!f["name"].value) f["name"].value = last.name || "";
      if (!f["email"].value) f["email"].value = last.email || "";
    }
  }
  onEnter.referral = renderReferral;
  document.addEventListener("ckd:result", renderReferral);

  $("#ref-copy").addEventListener("click", async () => {
    const text = $("#ref-summary").textContent;
    const status = $("#ref-copy-status");
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "Copied.";
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents($("#ref-summary"));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      status.textContent = "Press and hold to copy the selected text.";
    }
  });

  $("#referral-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const err = $("#ref-error");
    const status = $("#ref-status");
    const btn = $("#ref-submit");
    err.classList.add("hidden");
    status.textContent = "";
    status.classList.remove("bad");

    const name = f["name"].value.trim();
    const email = f["email"].value.trim();
    if (!name || !email || !f["email"].validity.valid) {
      err.textContent = "Please enter your name and a valid email address.";
      err.classList.remove("hidden");
      return;
    }
    const last = loadJSON("ckd_last", null);
    const provider = f["provider"].value.trim();
    const note = f["note"].value.trim();
    const payload = {
      assessment_id: last && last.assessment_id ? last.assessment_id : null,
      name,
      email,
      phone: f["phone"].value.trim(),
      preferred_provider: [provider, note ? "Note: " + note : ""].filter(Boolean).join(" | "),
    };

    btn.disabled = true;
    btn.textContent = "Sending...";
    try {
      const res = await fetch(`${API}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      status.textContent = data.message || "Your request was received.";
      e.target.reset();
    } catch (error) {
      status.textContent = "Could not send your request. Please try again.";
      status.classList.add("bad");
      console.error(error);
    } finally {
      btn.disabled = false;
      btn.textContent = "Send request";
    }
  });

  /* ---------------- Dialysis centers ---------------- */
  const CITIES = ["Santo Niño", "Koronadal", "Davao City", "General Santos", "Isulan", "Tacurong", "Quezon City", "Manila"];

  function openMap(city) {
    const q = encodeURIComponent(`dialysis center in ${city}, Philippines`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank", "noopener");
  }

  const chipBox = $("#center-chips");
  CITIES.forEach((c) => {
    const b = el("button", c, "chip");
    b.type = "button";
    b.addEventListener("click", () => {
      $("#center-city").value = c;
      openMap(c);
    });
    chipBox.appendChild(b);
  });

  $("#center-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const city = $("#center-city").value.trim();
    if (!city) {
      $("#center-city").focus();
      return;
    }
    openMap(city);
  });

  if (typeof PARTNER_CENTERS !== "undefined" && PARTNER_CENTERS.length) {
    $("#partner-card").classList.remove("hidden");
    const list = $("#partner-list");
    PARTNER_CENTERS.forEach((c) => {
      const card = el("div", null, "partner");
      card.appendChild(el("h3", c.name));
      if (c.city || c.address) card.appendChild(el("p", [c.address, c.city].filter(Boolean).join(", ")));
      if (c.phone) {
        const p = el("p");
        const a = el("a", c.phone);
        a.href = "tel:" + String(c.phone).replace(/[^\d+]/g, "");
        p.appendChild(a);
        card.appendChild(p);
      }
      if (c.philhealth === true) card.appendChild(el("p", "Accepts PhilHealth"));
      if (c.note) card.appendChild(el("p", c.note));
      list.appendChild(card);
    });
  }

  /* ---------------- Start ---------------- */
  route();
})();
