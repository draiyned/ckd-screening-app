/* Navigation, Dashboard, Monitoring, Feedback, Referral and Dialysis Centers.
   Depends on script.js (API_BASE, loadJSON, saveJSON) and centers.js (PARTNER_CENTERS). */
(function () {
  "use strict";

  const TABS = ["home", "dashboard", "monitoring", "feedback", "referral", "centers", "about"];
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

  /* items: [{key, label, count}]. Draws a pie with a percentage on each slice and a legend. */
  function pieChart(box, items, aria) {
    box.innerHTML = "";
    const total = items.reduce((s, i) => s + i.count, 0);
    if (!total) return emptyChart(box, "No screenings yet.");

    const C = 100, R = 90;
    const shown = items.filter((i) => i.count > 0);
    let svg = `<svg viewBox="0 0 200 200" role="img" aria-label="${aria || "Pie chart"}">`;
    if (shown.length === 1) {
      svg += `<circle class="pie-${shown[0].key}" cx="${C}" cy="${C}" r="${R}"/>`;
      svg += `<text class="pie-pct" x="${C}" y="${C + 5}" text-anchor="middle">100%</text>`;
    } else {
      let a0 = -Math.PI / 2;
      shown.forEach((it) => {
        const frac = it.count / total;
        const a1 = a0 + frac * 2 * Math.PI;
        const p = (a) => `${(C + R * Math.cos(a)).toFixed(2)} ${(C + R * Math.sin(a)).toFixed(2)}`;
        svg += `<path class="pie-${it.key}" d="M ${C} ${C} L ${p(a0)} A ${R} ${R} 0 ${frac > 0.5 ? 1 : 0} 1 ${p(a1)} Z"><title>${it.label}: ${it.count}</title></path>`;
        if (frac >= 0.06) {
          const am = (a0 + a1) / 2;
          svg += `<text class="pie-pct" x="${(C + R * 0.62 * Math.cos(am)).toFixed(1)}" y="${(C + R * 0.62 * Math.sin(am) + 5).toFixed(1)}" text-anchor="middle">${Math.round(frac * 100)}%</text>`;
        }
        a0 = a1;
      });
    }
    svg += "</svg>";

    const wrap = el("div", null, "pie-wrap");
    const pie = el("div", null, "pie");
    pie.innerHTML = svg; // built only from numbers and fixed labels
    wrap.appendChild(pie);
    const legend = el("ul", null, "pie-legend");
    items.forEach((it) => {
      const li = el("li");
      li.appendChild(el("i", null, "pie-sw pie-" + it.key));
      li.appendChild(el("span", it.label));
      li.appendChild(el("strong", `${Math.round((it.count / total) * 100)}% (${it.count})`));
      legend.appendChild(li);
    });
    wrap.appendChild(legend);
    box.appendChild(wrap);
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
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.json()).detail || ""; } catch (e2) { /* not JSON */ }
        const err = new Error("HTTP " + res.status);
        err.info = `Error ${res.status}${detail ? ": " + String(detail).slice(0, 160) : ""}`;
        throw err;
      }
      const data = await res.json();
      statsCache = { at: Date.now(), data };
      note.className = "notice hidden";
      renderStats(data);
    } catch (err) {
      note.textContent = "Could not load the statistics. " + (err.info ? "(" + err.info + ") " : (err.name === "AbortError" ? "(The server took too long.) " : "(Could not reach the server.) ")) + "Open this page again in a moment.";
      note.className = "notice notice-warn";
      console.error(err);
    } finally {
      clearTimeout(timer);
    }
  }

  const AGE_ORDER = ["16_18", "19_21", "22_25", "unknown"];
  const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);

  function renderAge(d) {
    const box = $("#chart-age");
    if (!d.by_age) {
      box.innerHTML = "";
      box.appendChild(el("p", "Age data is not available yet.", "muted small"));
      return [];
    }
    const labels = d.age_labels || {};
    const items = AGE_ORDER.map((k, i) => {
      const g = d.by_age[k] || { low: 0, moderate: 0, high: 0 };
      return {
        key: k === "unknown" ? "age4" : "age" + i,
        label: k === "unknown" ? "Other or not given" : labels[k] || k,
        count: g.low + g.moderate + g.high,
        atRisk: g.moderate + g.high,
      };
    }).filter((it) => it.key !== "age4" || it.count > 0);
    pieChart(box, items, "Share of screenings by age group");
    return items;
  }

  function renderSummary(d, ageItems) {
    const list = $("#dash-summary");
    list.innerHTML = "";
    const t = d.total;
    if (!t) {
      list.appendChild(el("li", "No screenings yet."));
      $("#dash-summary-note").textContent = "";
      return;
    }
    const r = d.by_risk;
    const atRisk = r.moderate + r.high;
    list.appendChild(el("li", `Out of ${t} screenings, ${pct(r.low, t)}% (${r.low}) were low risk, ${pct(r.moderate, t)}% (${r.moderate}) moderate risk, and ${pct(r.high, t)}% (${r.high}) high risk.`));
    if (atRisk > 0) list.appendChild(el("li", `${atRisk} screenings (${pct(atRisk, t)}%) were moderate or high risk. These people are advised to see a doctor for a proper kidney check.`));

    const known = ageItems.filter((it) => it.key !== "age4");
    const knownTotal = known.reduce((s, it) => s + it.count, 0);
    if (knownTotal > 0) {
      const top = known.slice().sort((a, b) => b.count - a.count)[0];
      list.appendChild(el("li", `The largest age group is ${top.label} (${top.count} screenings, ${pct(top.count, knownTotal)}% of screenings with a known age).`));
      const worst = known.filter((it) => it.count >= 5).sort((a, b) => b.atRisk / b.count - a.atRisk / a.count)[0];
      if (worst && worst.atRisk > 0) list.appendChild(el("li", `The share at moderate or high risk is highest in the ${worst.label} group (${pct(worst.atRisk, worst.count)}%).`));
    }
    list.appendChild(el("li", `${d.appointments} appointment request${d.appointments === 1 ? " was" : "s were"} saved.`));
    $("#dash-summary-note").textContent = "This covers only people who chose to use this site. It is not a study of how common kidney disease is. The platform does not diagnose.";
  }

  function renderStats(d) {
    $("#st-total").textContent = d.total;
    $("#st-low").textContent = d.by_risk.low;
    $("#st-moderate").textContent = d.by_risk.moderate;
    $("#st-high").textContent = d.by_risk.high;
    $("#st-appts").textContent = d.appointments;

    pieChart($("#chart-risk"), [
      { key: "low", label: "Low risk", count: d.by_risk.low },
      { key: "moderate", label: "Moderate risk", count: d.by_risk.moderate },
      { key: "high", label: "High risk", count: d.by_risk.high },
    ], "Share of screenings by risk level");

    const ageItems = renderAge(d);
    renderSummary(d, ageItems);

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

  /* ---------------- Feedback ---------------- */
  const FB_SECTIONS = [
    { title: "Website Accessibility and Navigation", items: [
      "I can open the website without difficulty.",
      "I can easily understand the homepage.",
      "I can easily find the features I need.",
      "The menus and buttons are easy to find.",
      "The website works properly on the device I am using.",
    ] },
    { title: "AI Assistive Model Functionality", items: [
      "I can easily access and use the AI assistive model.",
      "The AI responds whenever I submit a question.",
      "The AI\u2019s answers are easy to understand.",
      "The AI gives answers related to the questions I ask.",
      "I can ask follow-up questions without starting a new session.",
      "The AI responds without taking too much time.",
      "It is easy to type questions and read the AI\u2019s answers.",
    ] },
    { title: "User Interface and Experience", items: [
      "The website looks clean and organized.",
      "The instructions and labels are easy to understand.",
      "The buttons and icons are easy to recognize.",
      "The text and information are easy to read.",
      "I can use the website without needing much assistance.",
      "I find the website comfortable and convenient to use.",
    ] },
    { title: "Overall Evaluation", items: [
      "Overall, I am satisfied with how the website works.",
      "The website does what I expect it to do.",
      "I find the website easy to use.",
      "I did not have much difficulty using the website.",
      "I would recommend the website to other users.",
    ] },
  ];

  function buildFeedbackForm() {
    const box = $("#fb-sections");
    box.innerHTML = "";
    FB_SECTIONS.forEach((sec, si) => {
      const set = el("fieldset", null, "fb-sec");
      set.appendChild(el("legend", `${si + 1}. ${sec.title}`));
      sec.items.forEach((text, i) => {
        const row = el("div", null, "fb-row");
        row.dataset.key = si + "_" + i;
        row.appendChild(el("p", `${i + 1}. ${text}`, "fb-q"));
        const opts = el("div", null, "fb-opts");
        [5, 4, 3, 2, 1].forEach((v) => {
          const lab = el("label", null, "fb-opt");
          const inp = document.createElement("input");
          inp.type = "radio";
          inp.name = "s" + si + "_" + i;
          inp.value = String(v);
          lab.appendChild(inp);
          lab.appendChild(el("span", String(v)));
          opts.appendChild(lab);
        });
        row.appendChild(opts);
        set.appendChild(row);
      });
      box.appendChild(set);
    });
  }
  buildFeedbackForm();

  function showFbError(msg) {
    const n = $("#fb-error");
    n.textContent = msg;
    n.classList.toggle("hidden", !msg);
  }

  $("#feedback-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    showFbError("");
    $$("#feedback-form .fb-row").forEach((r) => r.classList.remove("missing"));
    const answers = [];
    let firstMissing = null;
    FB_SECTIONS.forEach((sec, si) => {
      const row = [];
      sec.items.forEach((_t, i) => {
        const picked = $(`input[name="s${si}_${i}"]:checked`);
        if (!picked) {
          const r = $(`.fb-row[data-key="${si}_${i}"]`);
          r.classList.add("missing");
          if (!firstMissing) firstMissing = r;
          row.push(0);
        } else row.push(Number(picked.value));
      });
      answers.push(row);
    });
    if (firstMissing) {
      showFbError("Please answer every statement. The ones you missed are outlined in red.");
      firstMissing.scrollIntoView({ block: "center" });
      return;
    }
    const btn = $("#fb-submit");
    btn.disabled = true;
    btn.textContent = "Sending...";
    try {
      const res = await fetch(`${API}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, comment: $("#fb-comment").value.trim() || null }),
      });
      if (res.status === 429) throw new Error("Too many attempts. Please wait a few minutes and try again.");
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.json()).detail || ""; } catch (e2) { /* not JSON */ }
        throw new Error(typeof detail === "string" && detail ? detail : "Could not send your feedback. Please try again.");
      }
      $("#feedback-form").classList.add("hidden");
      $("#fb-thanks-msg").textContent = "Thank you. Your feedback was saved.";
      $("#fb-thanks").classList.remove("hidden");
      loadFeedbackSummary();
    } catch (err) {
      showFbError(err.message || "Could not send your feedback. Please try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send feedback";
    }
  });

  $("#fb-again").addEventListener("click", () => {
    $("#feedback-form").reset();
    $("#feedback-form").classList.remove("hidden");
    $("#fb-thanks").classList.add("hidden");
    window.scrollTo(0, 0);
  });

  function interpret(m) {
    if (m >= 4.21) return "Strongly agree";
    if (m >= 3.41) return "Agree";
    if (m >= 2.61) return "Neutral";
    if (m >= 1.81) return "Disagree";
    return "Strongly disagree";
  }

  async function loadFeedbackSummary() {
    const box = $("#fb-summary");
    const count = $("#fb-count");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(`${API}/feedback/summary`, { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const d = await res.json();
      box.innerHTML = "";
      if (!d.count) {
        count.textContent = "No responses yet. Be the first to answer.";
        return;
      }
      const overall = d.sections.reduce((s, x) => s + x.mean, 0) / d.sections.length;
      count.textContent = `${d.count} response${d.count === 1 ? "" : "s"}. Overall average ${overall.toFixed(2)} (${interpret(overall)}).`;
      d.sections.forEach((s, si) => {
        const head = el("div", null, "fb-sum-head");
        head.appendChild(el("strong", FB_SECTIONS[si].title));
        head.appendChild(el("span", `${s.mean.toFixed(2)} ${interpret(s.mean)}`));
        box.appendChild(head);
        const track = el("div", null, "fb-bar");
        const fill = el("div");
        fill.style.width = (s.mean / 5) * 100 + "%";
        track.appendChild(fill);
        box.appendChild(track);
        const det = document.createElement("details");
        det.appendChild(el("summary", "Each statement"));
        s.items.forEach((m, i) => {
          const r = el("div", null, "fb-item");
          r.appendChild(el("span", `${i + 1}. ${FB_SECTIONS[si].items[i]}`));
          r.appendChild(el("strong", m.toFixed(2)));
          det.appendChild(r);
        });
        box.appendChild(det);
      });
    } catch (err) {
      count.textContent = "Results are not available right now.";
      console.error(err);
    } finally {
      clearTimeout(timer);
    }
  }

  onEnter.feedback = loadFeedbackSummary;

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
  /* Center picker: search PARTNER_CENTERS by name, phone, or email. */
  const centers = typeof PARTNER_CENTERS !== "undefined" ? PARTNER_CENTERS : [];
  const hay = centers.map((c) => [c.name, c.city, c.phone, c.email].filter(Boolean).join(" ").toLowerCase());
  function searchCenters(q) {
    const t = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < centers.length; i++) if (t.every((w) => hay[i].includes(w))) out.push(centers[i]);
    return out;
  }
  let selectedCenter = null;
  function chosenCenter() { return selectedCenter; }

  function updatePicker() {
    const chosen = $("#ref-center-chosen");
    chosen.classList.toggle("hidden", !selectedCenter);
    chosen.textContent = selectedCenter ? "Selected: " + selectedCenter.name + (selectedCenter.email ? " (" + selectedCenter.email + ")" : "") : "";
    $("#ref-mailto").classList.toggle("hidden", !(selectedCenter && selectedCenter.email));
  }
  function showResults() {
    const box = $("#ref-center-results");
    box.innerHTML = "";
    const q = $("#ref-center-search").value.trim();
    if (!q) return;
    const found = searchCenters(q);
    found.slice(0, 8).forEach((c) => {
      const b = el("button", c.name);
      b.type = "button";
      b.appendChild(el("small", [c.phone, c.email].filter(Boolean).join("  |  ")));
      b.addEventListener("click", () => {
        selectedCenter = c;
        box.innerHTML = "";
        $("#ref-center-search").value = "";
        updatePicker();
      });
      box.appendChild(b);
    });
    if (!found.length) box.appendChild(el("p", "No match. Try fewer letters, or type a clinic name instead.", "muted small"));
    else if (found.length > 8) box.appendChild(el("p", found.length + " matches. Type more letters to narrow the list.", "muted small"));
  }
  if (centers.length) {
    $("#ref-center-wrap").classList.remove("hidden");
    $("#ref-provider-wrap").classList.add("hidden");
    $("#ref-center-search").addEventListener("input", showResults);
    $("#ref-center-other").addEventListener("click", () => {
      selectedCenter = null;
      updatePicker();
      $("#ref-provider-wrap").classList.remove("hidden");
      $("#referral-form").elements["provider"].focus();
    });
  }

  $("#ref-mailto").addEventListener("click", () => {
    const c = chosenCenter();
    if (!c || !c.email) return;
    const f = $("#referral-form").elements;
    const body = [
      "Hello " + c.name + ",",
      "",
      "I would like to ask about dialysis or kidney care services.",
      "",
      "Name: " + (f["name"].value.trim() || "-"),
      "Email: " + (f["email"].value.trim() || "-"),
      "Phone: " + (f["phone"].value.trim() || "-"),
      f["note"].value.trim() ? "Note: " + f["note"].value.trim() : "",
      "",
      $("#ref-summary").textContent,
      "",
      "Thank you.",
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
    const subject = "Referral inquiry from " + (f["name"].value.trim() || "a patient");
    window.location.href = "mailto:" + c.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body).slice(0, 1800);
  });

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
    const pickedC = chosenCenter();
    const provider = pickedC ? [pickedC.name, pickedC.city].filter(Boolean).join(", ") : f["provider"].value.trim();
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
      status.textContent = data.message || "Your request was saved.";
      e.target.reset();
      selectedCenter = null;
      $("#ref-center-results").innerHTML = "";
      $("#ref-provider-wrap").classList.toggle("hidden", centers.length > 0);
      updatePicker();
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
  const CITIES = ["Koronadal", "General Santos", "Davao City", "Cagayan de Oro", "Cebu City", "Iloilo City", "Quezon City", "Manila"];

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

  if (centers.length) {
    $("#partner-card").classList.remove("hidden");
    const list = $("#partner-list");
    const more = $("#partner-more");
    const PAGE = 20;
    let matches = centers, shown = 0;

    function card(c) {
      const d = el("div", null, "partner");
      d.appendChild(el("h3", c.name));
      if (c.city || c.address) d.appendChild(el("p", [c.address, c.city].filter(Boolean).join(", ")));
      if (c.phone) {
        const p = el("p");
        const a = el("a", c.phone);
        a.href = "tel:" + String(c.phone).split(/[\/;]/)[0].replace(/[^\d+]/g, "");
        p.appendChild(a);
        d.appendChild(p);
      }
      if (c.email) {
        const p = el("p");
        const a = el("a", c.email);
        a.href = "mailto:" + c.email;
        p.appendChild(a);
        d.appendChild(p);
      }
      if (c.philhealth === true) d.appendChild(el("p", "Accepts PhilHealth"));
      if (c.note) d.appendChild(el("p", c.note));
      return d;
    }
    function draw(reset) {
      if (reset) { list.innerHTML = ""; shown = 0; }
      matches.slice(shown, shown + PAGE).forEach((c) => list.appendChild(card(c)));
      shown = Math.min(matches.length, shown + PAGE);
      $("#partner-count").textContent = matches.length ? `Showing ${shown} of ${matches.length}` : "No match. Try fewer letters.";
      more.classList.toggle("hidden", shown >= matches.length);
    }
    $("#partner-search").addEventListener("input", (ev) => {
      const q = ev.target.value.trim();
      matches = q ? searchCenters(q) : centers;
      draw(true);
    });
    more.addEventListener("click", () => draw(false));
    draw(true);
  }

  /* ---------------- Start ---------------- */
  route();
})();
