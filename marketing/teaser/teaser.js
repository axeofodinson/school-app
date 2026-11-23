/* Al-Syed teaser timeline.
 * One paused GSAP timeline, seekable by time: window.seek(ms) renders the exact frame.
 * Deterministic: no Date.now(), no Math.random() (seeded PRNG only), no CSS transitions.
 * URL params (query or #hash): urdu=placeholder|draft  autoplay=1
 * The preview player drives it with postMessage({ seek: ms }).
 */
(function () {
  "use strict";
  const params = new URLSearchParams(location.search + "&" + location.hash.slice(1));
  const URDU_MODE = params.get("urdu") === "draft" ? "draft" : "placeholder";
  const DURATION = 38; // seconds
  // Beats in seconds; the 1:1 loop is stitched from LOOP segments by render.mjs.
  const BEATS = { hook: [0, 4.2], learn: [4.2, 10.6], understand: [10.6, 17.6], exam: [17.6, 24.4], where: [24.4, 31.8], close: [31.8, 38] };
  const LOOP = [[0, 3.7], [31.8, 35.6]];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  async function loadCopy() {
    if (window.__COPY__) return window.__COPY__;
    const r = await fetch(window.__COPY_URL__ || "copy.json");
    return r.json();
  }

  function fillCopy(copy) {
    const L = copy.lines;
    document.querySelectorAll("[data-en]").forEach((el) => {
      const k = el.dataset.en;
      if (!L[k]) throw new Error("copy.json is missing line: " + k);
      el.textContent = L[k].en;
    });
    document.querySelectorAll("[data-ur]").forEach((el) => {
      const k = el.dataset.ur;
      const line = L[k];
      if (!line) throw new Error("copy.json is missing line: " + k);
      let text = line.ur;
      if (!text && URDU_MODE === "draft" && line.ur_draft) text = line.ur_draft;
      if (text) {
        el.textContent = text;
        el.lang = "ur"; el.dir = "rtl";
        el.classList.remove("ph");
      } else {
        el.textContent = el.dataset.ph === "long" ? "[UR] " + line.en : "[UR]";
        el.classList.add("ph");
        el.removeAttribute("lang"); el.dir = "ltr";
      }
    });
    if (URDU_MODE === "draft") document.documentElement.classList.add("urdu-draft");
    // split headline words for staggered reveals
    document.querySelectorAll(".hl").forEach((el) => {
      const words = el.textContent.trim().split(/\s+/);
      el.textContent = "";
      words.forEach((w, i) => {
        const s = document.createElement("span");
        s.className = "w"; s.textContent = w;
        el.appendChild(s);
        if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
      });
    });
  }

  function buildDom() {
    const seats = document.getElementById("seats");
    for (let i = 0; i < 40; i++) {
      const d = document.createElement("div");
      d.className = "seat"; d.innerHTML = "<i></i><b></b>";
      seats.appendChild(d);
    }
    // a made-up illustrative score distribution for the mock UI (not a statistic)
    const heights = [0.12, 0.2, 0.32, 0.5, 0.74, 0.92, 1, 0.78, 0.5, 0.26];
    const bars = document.getElementById("bars");
    heights.forEach((h, i) => {
      const b = document.createElement("div");
      b.className = "bar" + (i >= 6 ? " hi" : "");
      b.style.height = h * 100 + "%";
      bars.appendChild(b);
    });
  }

  let tl = null, ctx = null;

  function build() {
    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
    ctx = gsap.context(() => {
      tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out", duration: 0.8 } });
      // Total length is fixed so every format and the loop share one clock.
      tl.set({}, {}, DURATION);

      const blurIn = { opacity: 0, y: 28, filter: "blur(10px)" };
      const sharp = { opacity: 1, y: 0, filter: "blur(0px)" };
      const words = (el, t, stagger = 0.09) => {
        const w = $$(".w", el);
        gsap.set(w, blurIn);
        tl.to(w, { ...sharp, duration: 0.9, stagger }, t);
      };
      const rise = (el, t, dur = 0.8, from = { opacity: 0, y: 24 }) => {
        gsap.set(el, from);
        tl.to(el, { opacity: 1, y: 0, x: 0, scale: 1, filter: "blur(0px)", duration: dur }, t);
      };
      const scene = (id, [a, b]) => {
        const el = $(id);
        gsap.set(el, { autoAlpha: 0 });
        tl.set(el, { autoAlpha: 1, scale: 1, filter: "blur(0px)" }, a);
        tl.to(el, { autoAlpha: 0, scale: 0.97, filter: "blur(8px)", duration: 0.4, ease: "power2.in" }, b - 0.4);
      };
      const tap = (el, t) => {
        const r = $(".ripple", el);
        tl.to(el, { scale: 0.95, duration: 0.1, ease: "power2.out" }, t)
          .to(el, { scale: 1, duration: 0.45, ease: "back.out(3)" }, t + 0.1);
        if (r) {
          gsap.set(r, { scale: 0, opacity: 0 });
          tl.fromTo(r, { scale: 0, opacity: 0.9 }, { scale: 1.4, opacity: 0, duration: 0.6, ease: "power2.out", immediateRender: false }, t);
        }
      };

      // ambient orbs drift for the whole piece
      tl.fromTo(".orb-a", { xPercent: 0, yPercent: 0 }, { xPercent: 22, yPercent: 14, duration: DURATION, ease: "sine.inOut" }, 0);
      tl.fromTo(".orb-b", { xPercent: 0, yPercent: 0 }, { xPercent: -18, yPercent: -16, duration: DURATION, ease: "sine.inOut" }, 0);

      // 1 · HOOK ---------------------------------------------------------
      scene("#s-hook", BEATS.hook);
      words($(".hook-line"), 0.25, 0.14);
      rise(".ur-hook", 0.95, 0.9, { opacity: 0, y: 16, filter: "blur(6px)" });
      gsap.set(".brand .mark", { opacity: 0, scale: 0.6, rotate: -8 });
      tl.to(".brand .mark", { opacity: 1, scale: 1, rotate: 0, duration: 0.8, ease: "back.out(1.8)" }, 1.95);
      tl.to(".brand .mark-book", { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" }, 2.15);
      tl.to(".brand .mark-star", { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" }, 2.45);
      tl.to(".brand .mark-star", { fillOpacity: 1, duration: 0.4 }, 2.85);
      rise(".brand-text", 2.3, 0.8, { opacity: 0, x: -20 });

      // 2 · LEARN --------------------------------------------------------
      scene("#s-learn", BEATS.learn);
      words($("#s-learn .hl"), 4.35);
      rise("#s-learn .cap .ur", 4.9);
      rise("#s-learn .cap .sub", 5.1);
      rise("#s-learn .phone", 4.5, 1.0, { opacity: 0, y: 60, scale: 0.92 });
      tl.to("#s-learn .tri", { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" }, 5.4);
      tl.to("#s-learn .right", { strokeDashoffset: 0, duration: 0.3 }, 6.2);
      tl.to("#s-learn .hyp", { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" }, 6.4);
      tl.to("#s-learn .lbl", { opacity: 1, duration: 0.35, stagger: 0.1 }, 6.8);
      gsap.set("#s-learn .formula span", { opacity: 0, y: 10, scale: 0.8 });
      tl.to("#s-learn .formula span", { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.08, ease: "back.out(2)" }, 7.05);
      tl.to("#s-learn .formula .fc", { scale: 1.18, duration: 0.2, ease: "power2.out" }, 7.6)
        .to("#s-learn .formula .fc", { scale: 1, duration: 0.4, ease: "back.out(3)" }, 7.8);
      // language flip: EN → اردو (content moves rightward, the RTL reading direction)
      tl.to("#s-learn .lang-knob", { xPercent: 100, duration: 0.45, ease: "back.out(1.6)" }, 8.1);
      tl.to("#s-learn .lesson-en", { opacity: 0, x: 30, duration: 0.35, ease: "power2.in" }, 8.15);
      gsap.set("#s-learn .lesson-ur", { opacity: 0, x: -30 });
      tl.to("#s-learn .lesson-ur", { opacity: 1, x: 0, duration: 0.6 }, 8.45);

      // 3 · UNDERSTAND ---------------------------------------------------
      scene("#s-understand", BEATS.understand);
      words($("#s-understand .hl"), 10.75);
      rise("#s-understand .cap .ur", 11.3);
      rise("#s-understand .cap .sub", 11.5);
      rise("#s-understand .phone", 10.85, 1.0, { opacity: 0, y: 60, scale: 0.92 });
      gsap.set("#s-understand .opt", { opacity: 0, y: 14 });
      tl.to("#s-understand .opt", { opacity: 1, y: 0, duration: 0.5, stagger: 0.07 }, 11.35);
      const D = "#opt-d", C = "#opt-c";
      tap($(D), 12.15);
      tl.to(D, { backgroundColor: "#fdebe7", boxShadow: "inset 0 0 0 0.14em #e5604d", duration: 0.25 }, 12.3);
      tl.to(D, { keyframes: { x: [0, -7, 6, -4, 2, 0] }, duration: 0.45, ease: "none" }, 12.3);
      tl.to(D + " .x", { opacity: 1, duration: 0.2 }, 12.35);
      tl.to(C, { backgroundColor: "#e3f5ec", boxShadow: "inset 0 0 0 0.14em #1f9d6b", duration: 0.3 }, 12.6);
      rise("#s-understand .why", 12.8, 0.7, { opacity: 0, y: 30 });
      rise("#s-understand .follow", 14.15, 0.7, { opacity: 0, y: 30 });
      gsap.set("#s-understand .mastery", { opacity: 0, scale: 0.85 });
      tl.to("#s-understand .mastery", { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, 14.95);
      tl.to("#s-understand .ring-fg", { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut" }, 15.1);
      gsap.set("#s-understand .ring-label", { opacity: 0.25 });
      gsap.set("#s-understand .ring-check", { scale: 0 });
      tl.to("#s-understand .ring-label", { opacity: 1, duration: 0.3 }, 16.15);
      tl.to("#s-understand .ring-check", { scale: 1, duration: 0.5, ease: "back.out(3)" }, 16.2);

      // 4 · SURPRISE EXAM ------------------------------------------------
      scene("#s-exam", BEATS.exam);
      words($("#s-exam .hl"), 17.75);
      rise("#s-exam .cap .ur", 18.3);
      rise("#s-exam .cap .sub", 18.5);
      rise("#s-exam .panel", 17.9, 1.0, { opacity: 0, y: 50, scale: 0.94 });
      ["#st-1", "#st-2", "#st-3"].forEach((id, i) => {
        const t = 18.75 + i * 0.6;
        tap($(id), t);
        if (i < 2) tl.to(id, { boxShadow: "inset 0 0 0 0.14em #f2a93b", backgroundColor: "#2a2a2a", duration: 0.25 }, t + 0.08);
        tl.to(id + " em", { backgroundColor: "#f2a93b", color: "#0b1220", duration: 0.25 }, t + 0.08);
      });
      rise("#s-exam .blueprint", 18.4, 0.6, { opacity: 0, y: 10 });
      tl.to("#s-exam .blueprint", { opacity: 0, duration: 0.3 }, 20.0);
      rise("#s-exam .live", 20.2, 0.6, { opacity: 0, y: 16 });
      const rnd = mulberry32(40);
      const order = Array.from({ length: 40 }, (_, i) => i);
      // deterministic shuffle (Fisher–Yates on the seeded PRNG, since sort() with a comparator is engine-dependent)
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const seatEls = $$("#seats .seat i");
      order.forEach((idx, k) => {
        tl.to(seatEls[idx], { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.5)" }, 20.45 + k * 0.028);
      });
      // a pulse runs through the room: answers being saved
      const doneEls = $$("#seats .seat b");
      order.forEach((idx, k) => {
        tl.to(doneEls[idx], { opacity: 1, duration: 0.2 }, 21.35 + k * 0.012)
          .to(doneEls[idx], { opacity: 0, duration: 0.3 }, 21.6 + k * 0.012);
      });
      tl.to("#s-exam .live", { opacity: 0, y: -16, duration: 0.35, ease: "power2.in" }, 22.15);
      rise("#s-exam .results", 22.4, 0.5, { opacity: 0, y: 16 });
      tl.to("#s-exam .bar", { scaleY: 1, duration: 0.6, stagger: 0.04, ease: "power3.out" }, 22.5);
      rise("#s-exam .weak", 23.0, 0.5, { opacity: 0, y: 10 });

      // 5 · WORKS WHERE YOU ARE ------------------------------------------
      scene("#s-where", BEATS.where);
      words($("#s-where .hl"), 24.55);
      rise("#s-where .cap .ur", 25.1);
      rise("#s-where .cap .sub", 25.3);
      $$("#s-where .dev").forEach((el, i) => rise(el, 24.75 + i * 0.25, 0.8, { opacity: 0, y: 50, scale: 0.9 }));
      tl.to("#s-where .wifi-x", { strokeDashoffset: 0, duration: 0.35, ease: "power2.inOut" }, 26.6);
      tl.to("#s-where .wifi path:not(.wifi-x)", { opacity: 0.25, duration: 0.3 }, 26.65);
      rise("#s-where .pill.offline", 26.8, 0.55, { opacity: 0, y: -14, xPercent: -50 });
      gsap.set("#s-where .pill-n", { scale: 0 });
      tl.to("#s-where .pill-n", { scale: 1, duration: 0.4, ease: "back.out(3)" }, 27.3);
      // the handset keeps working offline: its lines keep filling
      gsap.set("#s-where .handset .mini i", { transformOrigin: "0 50%", scaleX: 0.3 });
      tl.to("#s-where .handset .mini i", { scaleX: 1, duration: 0.5, stagger: 0.3 }, 26.9);
      tl.to("#s-where .pill.offline", { opacity: 0, y: -14, duration: 0.3, ease: "power2.in" }, 28.25);
      tl.to("#s-where .wifi-x", { strokeDashoffset: 1, duration: 0.3 }, 28.2);
      tl.to("#s-where .wifi path:not(.wifi-x)", { opacity: 1, duration: 0.3 }, 28.25);
      rise("#s-where .pill.synced", 28.45, 0.55, { opacity: 0, y: -14, xPercent: -50 });
      tl.to("#s-where .pill.synced", { opacity: 0, duration: 0.3 }, 29.75);
      tl.to("#s-where .devices", { opacity: 0.18, scale: 0.9, filter: "blur(4px)", duration: 0.6, ease: "power2.inOut" }, 29.4);
      gsap.set("#s-where .a4", { opacity: 0, yPercent: 70, rotate: -9 });
      tl.to("#s-where .a4", { opacity: 1, yPercent: 0, rotate: -2.5, duration: 1.0, ease: "power3.out" }, 29.5);
      rise("#s-where .a4-cap", 30.0, 0.6, { opacity: 0, y: 14 });

      // 6 · CLOSE --------------------------------------------------------
      scene("#s-close", BEATS.close);
      rise("#s-close .mark", 31.9, 0.9, { opacity: 0, scale: 0.7, filter: "blur(8px)" });
      words($("#s-close .soon"), 32.2, 0.12);
      rise("#s-close .ur-soon", 32.85, 0.9, { opacity: 0, y: 16, filter: "blur(6px)" });
      rise("#s-close .close-school", 33.45);
      rise("#s-close .ur-school", 33.75);
      rise("#s-close .platforms", 34.2, 0.8, { opacity: 0, y: 14, scale: 0.96 });
      rise("#s-close .store", 34.5);
    });
  }

  function seek(ms) {
    tl.seek(Math.max(0, Math.min(DURATION, ms / 1000)), false);
  }

  async function init() {
    const copy = await loadCopy();
    fillCopy(copy);
    buildDom();
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('600 40px "Fraunces"'), document.fonts.load('400 20px "Inter"'),
      document.fonts.load('600 20px "Inter"'), document.fonts.load('800 20px "Inter"'),
      document.fonts.load('400 30px "Nastaliq"', "اردو"), document.fonts.load('700 30px "Nastaliq"', "اردو"),
    ]);
    build();
    seek(0);
    // rebuild on resize (live preview only) and keep the current time
    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => { const t = tl.time(); ctx.revert(); build(); tl.seek(t, false); }, 120);
    });
    window.seek = seek;
    window.TEASER = { duration: DURATION * 1000, beats: BEATS, loop: LOOP, urdu: URDU_MODE };
    window.addEventListener("message", (e) => {
      if (e.source === window.parent && e.data && typeof e.data.seek === "number") seek(e.data.seek);
    });
    window.__ready = true;
    if (window.parent !== window) window.parent.postMessage({ teaserReady: window.TEASER }, "*");
    document.documentElement.dataset.ready = "1";
    if (params.get("autoplay") === "1") {
      let start = null;
      const step = (now) => {
        if (start === null) start = now;
        seek((now - start) % (DURATION * 1000 + 1500));
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  init().catch((e) => { window.__error = String(e && e.stack || e); console.error(e); });
})();
