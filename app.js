/* Songsmith Studio — a single-page client for the Suno API (https://docs.sunoapi.org). */
(() => {
  "use strict";

  // ============ Config ============
  const DIRECT_API = "https://api.sunoapi.org";
  const DIRECT_UPLOAD = "https://sunoapiorg.redpandaai.co";
  const isHosted = location.protocol.startsWith("http") && !/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);
  // On Netlify we use same-origin proxies (see netlify.toml) to avoid CORS; elsewhere we call the API directly.
  let apiBase = location.protocol.startsWith("http") ? "/suno" : DIRECT_API;
  let uploadBase = location.protocol.startsWith("http") ? "/upload" : DIRECT_UPLOAD;
  const CALLBACK_URL = isHosted ? `${location.origin}/callback` : "https://example.com/callback";

  const POLL_MS = 5000;
  const POLL_TIMEOUT_MS = 20 * 60 * 1000;

  const MODELS = [
    { id: "V6", emoji: "🌟", name: "V6", desc: "Most natural vocals & richest detail", badge: "Best" },
    { id: "V6_WILD", emoji: "🌀", name: "V6 Wild", desc: "Bolder, more distinctive & experimental" },
    { id: "V6_MINI", emoji: "⚡", name: "V6 Mini", desc: "Fast and light — great for sketching ideas" },
  ];
  const LEGACY_MODELS = [
    { id: "V5_5", name: "V5.5", desc: "Voice-customised" },
    { id: "V5", name: "V5", desc: "Fast, expressive" },
    { id: "V4_5PLUS", name: "V4.5+", desc: "Richer tones, 8 min" },
    { id: "V4_5ALL", name: "V4.5 All", desc: "Better structure" },
    { id: "V4_5", name: "V4.5", desc: "Smart prompts" },
    { id: "V4", name: "V4", desc: "Clear vocals, 4 min" },
  ];
  const DURATION_MODELS = new Set(["V6", "V6_WILD", "V6_MINI", "V5_5"]);
  const LIMITS = {
    V4: { style: 200, lyrics: 3000 },
    default: { style: 1000, lyrics: 5000 },
  };

  const IDEAS = [
    "A feel-good summer anthem about road-tripping with best friends",
    "A rainy-night lo-fi song about missing someone in another timezone",
    "An epic orchestral theme for a hero's final battle",
    "A funky disco track about a cat who owns the dance floor",
    "A heartfelt acoustic ballad for a grandparent's birthday",
    "A hype workout track with a chant-along hook",
    "A dreamy bedroom-pop song about stargazing on a rooftop",
    "A country song about a truck that refuses to die",
  ];
  const VIBES = ["Pop", "Lo-fi chill", "Synthwave", "Indie folk", "Hip-hop", "Rock anthem", "EDM drop", "R&B soul", "Jazz café", "Cinematic", "K-pop", "Reggaeton", "Country", "Metal", "Ambient", "Afrobeats"];
  const STYLE_TAGS = ["upbeat", "melancholic", "female vocals", "male vocals", "acoustic guitar", "808 bass", "piano", "strings", "catchy hook", "90s", "80s", "dreamy", "gritty", "anthemic", "slow tempo", "fast tempo"];
  const LYRIC_IDEAS = ["First love at a summer festival", "Leaving home for the big city", "Friendship that survived everything", "Dancing alone in the kitchen at 2am", "A robot learning to feel"];
  const SURPRISES = [
    { p: "A sea shanty about debugging code at 3am", s: "sea shanty, male choir, stomping, accordion" },
    { p: "A glittering 80s power ballad about a houseplant that finally bloomed", s: "80s power ballad, big drums, synth, female vocals" },
    { p: "A chill bossa nova about Sunday pancakes", s: "bossa nova, nylon guitar, soft female vocals" },
    { p: "A trap banger about grandma's secret cookie recipe", s: "trap, 808, hi-hats, playful" },
    { p: "A cinematic anthem for the last day of summer", s: "cinematic, orchestral, soaring choir, epic" },
    { p: "A punk-rock song about the bus being late again", s: "pop punk, fast tempo, shouty chorus" },
    { p: "A dreamy city-pop track about neon Tokyo nights", s: "city pop, 80s japanese, funky bass, synth" },
  ];

  const STATUS_INFO = {
    PENDING: { label: "Queued", pct: 12, msg: "Warming up the studio…" },
    TEXT_SUCCESS: { label: "Writing", pct: 40, msg: "Lyrics & arrangement ready, recording…" },
    FIRST_SUCCESS: { label: "First take ready", pct: 75, msg: "First track is playable — finishing the second…" },
    SUCCESS: { label: "Done", pct: 100, msg: "All tracks ready!" },
  };
  const FAIL_STATES = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "SENSITIVE_WORD_ERROR", "GENERATE_WAV_FAILED", "GENERATE_MP4_FAILED", "CALLBACK_EXCEPTION", "FAILED", "ERROR"]);
  const API_ERRORS = {
    400: "Some parameters were rejected. Check your inputs and try again.",
    401: "That API key wasn't accepted. Double-check it and try again.",
    404: "That endpoint wasn't found.",
    405: "Rate limit reached — give it a moment.",
    413: "Your prompt or lyrics are too long for this model.",
    429: "You're out of credits. Top up your Suno API account to keep creating.",
    430: "Too many requests at once — try again in a few seconds.",
    455: "The Suno API is under maintenance. Please try again soon.",
    500: "The Suno API hit a server error. Please try again.",
  };

  // ============ Storage ============
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("ss." + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem("ss." + k, JSON.stringify(v)); } catch (e) {}
    },
    del(k) {
      try { localStorage.removeItem("ss." + k); } catch (e) {}
    },
  };
  function getKey() {
    try { return sessionStorage.getItem("ss.key") || localStorage.getItem("ss.key") || ""; } catch (e) { return memKey; }
  }
  let memKey = "";
  function setKey(k, remember) {
    memKey = k;
    try {
      sessionStorage.setItem("ss.key", k);
      if (remember) localStorage.setItem("ss.key", k);
      else localStorage.removeItem("ss.key");
    } catch (e) {}
  }
  function clearKey() {
    memKey = "";
    try { sessionStorage.removeItem("ss.key"); localStorage.removeItem("ss.key"); } catch (e) {}
  }

  // ============ State ============
  const state = {
    mode: "simple",
    model: store.get("model", "V6"),
    vocal: "",
    variety: 1,
    remixType: "cover",
    remixVocal: "",
    remixModel: "V6",
    remixFile: null,
    refs: { image: [], audio: [], video: [] },
    library: store.get("library", []),
    jobs: store.get("jobs", []).filter((j) => j.status === "running" && Date.now() - j.createdAt < POLL_TIMEOUT_MS),
    libFilter: "all",
    libQuery: "",
    queue: [],
    current: null,
  };

  // ============ Helpers ============
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = (s) => {
    if (!isFinite(s) || s < 0) return "0:00";
    s = Math.round(s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");

  function toast(msg, kind = "") {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }
  function setLoading(btn, on) {
    btn.disabled = on;
    btn.classList.toggle("loading", on);
  }
  function showError(el, msg) {
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  // ============ API ============
  class ApiError extends Error {
    constructor(msg, code) { super(msg); this.code = code; }
  }

  async function rawFetch(base, path, opts) {
    const res = await fetch(base + path, opts);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) {
      const e = new Error("non-json");
      e.nonJson = true;
      e.status = res.status;
      throw e;
    }
    return res.json();
  }

  async function api(path, { method = "GET", body, key } = {}) {
    const k = key || getKey();
    const opts = {
      method,
      headers: { Authorization: `Bearer ${k}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    };
    let json;
    try {
      json = await rawFetch(apiBase, path, opts);
    } catch (e) {
      // Proxy not available (e.g. plain static server) — fall back to calling the API directly.
      if (apiBase !== DIRECT_API && (e.nonJson || e instanceof TypeError)) {
        apiBase = DIRECT_API;
        try {
          json = await rawFetch(apiBase, path, opts);
        } catch (e2) {
          throw new ApiError("Couldn't reach the Suno API. Check your connection and try again.", 0);
        }
      } else if (e.nonJson) {
        throw new ApiError(API_ERRORS[e.status] || `Unexpected response (${e.status}).`, e.status);
      } else {
        throw new ApiError("Couldn't reach the Suno API. Check your connection and try again.", 0);
      }
    }
    if (json && json.code === 200) return json.data;
    const code = json?.code;
    const detail = json?.msg && json.msg !== "success" ? json.msg : "";
    const friendly = API_ERRORS[code];
    throw new ApiError(friendly ? (detail && code === 400 ? `${friendly} (${detail})` : friendly) : detail || "Request failed.", code);
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("uploadPath", "songsmith");
    fd.append("fileName", `${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`);
    const opts = { method: "POST", headers: { Authorization: `Bearer ${getKey()}` }, body: fd };
    let json;
    try {
      json = await rawFetch(uploadBase, "/api/file-stream-upload", opts);
    } catch (e) {
      if (uploadBase !== DIRECT_UPLOAD) {
        uploadBase = DIRECT_UPLOAD;
        json = await rawFetch(uploadBase, "/api/file-stream-upload", opts).catch(() => null);
      }
    }
    const url = json?.data?.downloadUrl || json?.data?.fileUrl;
    if (!url) throw new ApiError(json?.msg || "Upload failed. Try a smaller file or paste a public URL instead.", json?.code);
    return url;
  }

  // ============ Credits ============
  async function refreshCredits() {
    try {
      const c = await api("/api/v1/generate/credit");
      const n = typeof c === "number" ? c : Number(c?.credits ?? c);
      $("#creditsVal").textContent = isFinite(n) ? n.toLocaleString() : "—";
      const pill = $("#creditsPill");
      pill.classList.toggle("low", n > 0 && n < 50);
      pill.classList.toggle("empty", n <= 0);
      return n;
    } catch (e) {
      $("#creditsVal").textContent = "—";
      throw e;
    }
  }

  // ============ Theme ============
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("ss.theme", t); } catch (e) {}
    $$("#themeSeg button").forEach((b) => b.classList.toggle("active", b.dataset.themeOpt === t));
  }

  // ============ Gate ============
  function showGate(msg) {
    $("#app").hidden = true;
    $("#gate").hidden = false;
    showError($("#gateError"), msg || "");
    setTimeout(() => $("#keyInput").focus(), 50);
  }
  function showApp() {
    $("#gate").hidden = true;
    $("#app").hidden = false;
    renderLibrary();
    renderRecent();
    renderJobs();
    state.jobs.forEach((j) => runJob(j, true));
  }

  $("#toggleKey").addEventListener("click", () => {
    const i = $("#keyInput");
    i.type = i.type === "password" ? "text" : "password";
  });
  $("#gateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = $("#keyInput").value.trim();
    const btn = $("#gateSubmit");
    if (!key) return showError($("#gateError"), "Please paste your API key.");
    setLoading(btn, true);
    showError($("#gateError"), "");
    try {
      await api("/api/v1/generate/credit", { key });
      setKey(key, $("#rememberKey").checked);
      $("#keyInput").value = "";
      showApp();
      refreshCredits().catch(() => {});
      toast("You're in. Let's make something great 🎶", "good");
    } catch (err) {
      showError($("#gateError"), err.code === 401 ? "That key didn't work. Copy it again from your Suno API dashboard." : err.message);
    } finally {
      setLoading(btn, false);
    }
  });
  $("#logoutBtn").addEventListener("click", () => {
    if (!confirm("Forget your API key on this device? Your library stays saved.")) return;
    clearKey();
    showGate();
  });
  $("#creditsPill").addEventListener("click", () => refreshCredits().then(() => toast("Credits refreshed")).catch((e) => toast(e.message, "bad")));

  // ============ Navigation ============
  function go(view) {
    $$(".tab").forEach((t) => {
      const on = t.dataset.view === view;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    $$(".view").forEach((v) => {
      const on = v.id === "view-" + view;
      v.hidden = !on;
      v.classList.toggle("active", on);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => go(t.dataset.view)));
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-goto]");
    if (g) go(g.dataset.goto);
  });

  // ============ Create form ============
  function segment(sel, attr, onPick) {
    $$(sel + " button").forEach((b) =>
      b.addEventListener("click", () => {
        $$(sel + " button").forEach((x) => x.classList.toggle("active", x === b));
        onPick(b.dataset[attr]);
      })
    );
  }
  function setSeg(sel, attr, val) {
    $$(sel + " button").forEach((x) => x.classList.toggle("active", x.dataset[attr] === String(val)));
  }

  segment("#modeSeg", "mode", (m) => {
    state.mode = m;
    $(".mode-simple").hidden = m !== "simple";
    $(".mode-custom").hidden = m !== "custom";
    updateCounters();
  });
  segment("#vocalSeg", "vocal", (v) => (state.vocal = v));
  segment("#varietySeg", "variety", (v) => (state.variety = Number(v)));
  segment("#themeSeg", "themeOpt", applyTheme);

  function renderModels(container, list, current, onPick, compact) {
    container.innerHTML = list
      .map(
        (m) => `<button type="button" class="model ${m.id === current ? "active" : ""}" data-model="${m.id}">
          ${m.badge ? `<i class="badge">${m.badge}</i>` : ""}
          ${!compact && m.emoji ? `<span class="m-emoji">${m.emoji}</span>` : ""}
          <b>${esc(m.name)}</b><span>${esc(m.desc)}</span></button>`
      )
      .join("");
    $$(".model", container).forEach((b) => b.addEventListener("click", () => onPick(b.dataset.model)));
  }
  function pickModel(id) {
    state.model = id;
    store.set("model", id);
    renderModels($("#modelPicker"), MODELS, id, pickModel);
    renderModels($("#legacyPicker"), LEGACY_MODELS, id, pickModel, true);
    $(".field-duration").style.opacity = DURATION_MODELS.has(id) ? 1 : 0.45;
    $("#cDuration").disabled = !DURATION_MODELS.has(id);
    updateCounters();
  }
  function pickRemixModel(id) {
    state.remixModel = id;
    renderModels($("#remixModelPicker"), MODELS, id, pickRemixModel, true);
  }

  function chipRow(container, items, onClick, { toggle = false, input } = {}) {
    container.innerHTML = items.map((t) => `<button type="button" class="chip" data-v="${esc(t)}">${esc(t)}</button>`).join("");
    $$(".chip", container).forEach((c) =>
      c.addEventListener("click", () => {
        if (toggle && input) {
          const parts = input.value.split(",").map((s) => s.trim()).filter(Boolean);
          const v = c.dataset.v;
          const idx = parts.findIndex((p) => p.toLowerCase() === v.toLowerCase());
          if (idx >= 0) parts.splice(idx, 1);
          else parts.push(v);
          input.value = parts.join(", ");
          input.dispatchEvent(new Event("input"));
        } else onClick(c.dataset.v);
      })
    );
    if (toggle && input) {
      const sync = () => {
        const parts = input.value.toLowerCase().split(",").map((s) => s.trim());
        $$(".chip", container).forEach((c) => c.classList.toggle("on", parts.includes(c.dataset.v.toLowerCase())));
      };
      input.addEventListener("input", sync);
      sync();
    }
  }

  // Character counters
  function limitFor(id) {
    const l = LIMITS[state.model] || LIMITS.default;
    return { sPrompt: 3000, sStyle: l.style, cTitle: 80, cStyle: l.style, cLyrics: l.lyrics, lPrompt: 200 }[id];
  }
  function updateCounters() {
    $$(".counter").forEach((c) => {
      const el = document.getElementById(c.dataset.for);
      if (!el) return;
      const max = limitFor(el.id) || Number(el.maxLength);
      if (max > 0) el.maxLength = max;
      c.textContent = `${el.value.length}/${max}`;
      c.classList.toggle("over", el.value.length > max);
    });
  }
  ["sPrompt", "sStyle", "cTitle", "cStyle", "cLyrics", "lPrompt"].forEach((id) => document.getElementById(id).addEventListener("input", updateCounters));

  // Sliders
  function sliderVal(el) {
    const v = Number(el.value);
    return v < 0 ? undefined : Math.round(v) / 100;
  }
  $$("[data-slider]").forEach((el) => {
    const out = document.getElementById(el.id + "Out");
    const upd = () => (out.textContent = sliderVal(el) === undefined ? "default" : sliderVal(el).toFixed(2));
    el.addEventListener("input", upd);
    upd();
  });
  $("#cDuration").addEventListener("input", (e) => {
    const v = Number(e.target.value);
    $("#cDurationOut").textContent = v < 10 ? "auto" : fmtTime(v);
  });

  // Lyric section tags
  $$(".tag-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const ta = $("#cLyrics");
      const start = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const ins = (before && !before.endsWith("\n") ? "\n\n" : "") + b.dataset.tag + "\n";
      ta.value = before + ins + ta.value.slice(ta.selectionEnd ?? start);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + ins.length;
      updateCounters();
    })
  );

  // Surprise
  $("#surpriseBtn").addEventListener("click", () => {
    const s = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
    if (state.mode === "simple") {
      $("#sPrompt").value = s.p;
      $("#sStyle").value = s.s;
      $("#sStyle").dispatchEvent(new Event("input"));
    } else {
      $("#cStyle").value = s.s;
      $("#cTitle").value ||= s.p.replace(/^An? /, "").split(" about ")[0].replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
      $("#cStyle").dispatchEvent(new Event("input"));
    }
    updateCounters();
  });

  // AI lyrics from the custom form
  $("#aiLyricsBtn").addEventListener("click", () => {
    const seed = $("#cTitle").value || $("#cStyle").value;
    $("#lPrompt").value = seed ? `A song called "${$("#cTitle").value || "untitled"}" in the style of ${$("#cStyle").value || "pop"}`.slice(0, 200) : "";
    updateCounters();
    go("lyrics");
    $("#lPrompt").focus();
  });

  // Media references (simple mode)
  const REF_LIMITS = { image: 5, audio: 5, video: 1 };
  const REF_EL = { image: "#refImages", audio: "#refAudios", video: "#refVideos" };
  function renderRefs() {
    for (const t of Object.keys(REF_EL)) {
      $(REF_EL[t]).innerHTML = state.refs[t]
        .map((u, i) => `<span class="ref-item"><span title="${esc(u)}">${esc(u.split("/").pop() || u)}</span><button type="button" data-rm="${t}:${i}" aria-label="Remove">✕</button></span>`)
        .join("");
    }
  }
  function addRef(type, url) {
    if (!safeUrl(url)) return toast("Please enter a valid http(s) URL.", "bad");
    if (state.refs[type].length >= REF_LIMITS[type]) return toast(`Max ${REF_LIMITS[type]} ${type} reference(s).`, "bad");
    const total = state.refs.image.length + state.refs.audio.length + state.refs.video.length;
    if (total >= 8) return toast("That's plenty of references (max 10 attachments incl. style & lyrics).", "bad");
    state.refs[type].push(url);
    renderRefs();
  }
  $$("[data-ref-add]").forEach((b) =>
    b.addEventListener("click", () => {
      const t = b.dataset.refAdd;
      const input = $(`input[data-ref="${t}"]`);
      addRef(t, input.value.trim());
      input.value = "";
    })
  );
  $$("[data-ref-file]").forEach((inp) =>
    inp.addEventListener("change", async () => {
      const f = inp.files[0];
      if (!f) return;
      const t = inp.dataset.refFile;
      toast(`Uploading ${f.name}…`);
      try {
        addRef(t, await uploadFile(f));
        toast("Uploaded ✓", "good");
      } catch (e) {
        toast(e.message, "bad");
      }
      inp.value = "";
    })
  );
  document.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]");
    if (!rm) return;
    const [t, i] = rm.dataset.rm.split(":");
    state.refs[t].splice(Number(i), 1);
    renderRefs();
  });

  function buildGeneratePayload() {
    const instrumental = $("#instrumental").checked;
    const model = state.model;
    const base = { model, instrumental, callBackUrl: CALLBACK_URL };
    if (state.mode === "simple") {
      const prompt = $("#sPrompt").value.trim();
      const style = $("#sStyle").value.trim();
      const r = state.refs;
      if (!prompt && !style) throw new Error("Describe your song or pick a vibe to get started.");
      if (!style && !r.image.length && !r.audio.length && !r.video.length)
        throw new Error("Pick a vibe (or type a style) so the model knows what it should sound like.");
      const p = { ...base, customMode: false };
      if (prompt) p.prompt = prompt;
      if (style) p.style = style;
      if (r.image.length) p.imageUrls = r.image.slice();
      if (r.audio.length) p.audioUrls = r.audio.slice();
      if (r.video.length) p.videoUrls = r.video.slice();
      return { payload: p, label: prompt || style };
    }
    const title = $("#cTitle").value.trim();
    const style = $("#cStyle").value.trim();
    const lyrics = $("#cLyrics").value.trim();
    const negativeTags = $("#cNegative").value.trim();
    if (!style && !lyrics && !negativeTags) throw new Error("Add a style or some lyrics (or both).");
    if (!instrumental && !lyrics && !style) throw new Error("Add lyrics, or switch on Instrumental.");
    const p = { ...base, customMode: true };
    if (title) p.title = title;
    if (style) p.style = style;
    if (lyrics && !instrumental) {
      // Legacy models read lyrics from `prompt`; V6 series uses `lyrics`.
      if (model.startsWith("V6")) p.lyrics = lyrics;
      else p.prompt = lyrics;
    }
    if (negativeTags) p.negativeTags = negativeTags;
    if (state.vocal && !instrumental) p.vocalGender = state.vocal;
    const sw = sliderVal($("#cStyleWeight"));
    const wc = sliderVal($("#cWeird"));
    const aw = sliderVal($("#cAudioWeight"));
    if (sw !== undefined) p.styleWeight = sw;
    if (wc !== undefined) p.weirdnessConstraint = wc;
    if (aw !== undefined && !instrumental) p.audioWeight = aw;
    if (state.variety !== 1) p.variety = state.variety;
    const dur = Number($("#cDuration").value);
    if (dur >= 10 && DURATION_MODELS.has(model)) p.duration = dur;
    const persona = $("#cPersona").value.trim();
    if (persona) {
      p.personaId = persona;
      p.personaModel = $("#cPersonaModel").value;
    }
    return { payload: p, label: title || style || lyrics.split("\n").find((l) => l && !l.startsWith("[")) || "Untitled" };
  }

  $("#createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#createError");
    showError(err, "");
    let built;
    try {
      built = buildGeneratePayload();
    } catch (x) {
      return showError(err, x.message);
    }
    const btn = $("#createBtn");
    setLoading(btn, true);
    try {
      const data = await api("/api/v1/generate", { method: "POST", body: built.payload });
      startJob({ type: "music", taskId: data.taskId, label: built.label, meta: { model: state.model, kind: "Original" } });
      toast("Recording started 🎙️ — you'll hear it in about 30 seconds.");
    } catch (x) {
      showError(err, x.message);
    } finally {
      setLoading(btn, false);
    }
  });

  // ============ Jobs & polling ============
  const JOB_ENDPOINTS = {
    music: "/api/v1/generate/record-info",
    lyrics: "/api/v1/lyrics/record-info",
    stems: "/api/v1/vocal-removal/record-info",
    wav: "/api/v1/wav/record-info",
    video: "/api/v1/mp4/record-info",
  };

  function saveJobs() {
    store.set("jobs", state.jobs.filter((j) => j.status === "running").map(({ onDone, ...j }) => j));
  }
  function startJob(j) {
    const job = { id: uid(), createdAt: Date.now(), status: "running", stage: "PENDING", ...j };
    state.jobs.unshift(job);
    saveJobs();
    renderJobs();
    runJob(job);
    return job;
  }

  async function runJob(job, resumed) {
    const endpoint = JOB_ENDPOINTS[job.type];
    let delay = resumed ? 500 : 3000;
    let misses = 0;
    while (job.status === "running") {
      await sleep(delay);
      delay = POLL_MS;
      if (Date.now() - job.createdAt > POLL_TIMEOUT_MS) {
        finishJob(job, "failed", "Timed out waiting for results. Try again later.");
        break;
      }
      let d;
      try {
        d = await api(`${endpoint}?taskId=${encodeURIComponent(job.taskId)}`);
        misses = 0;
      } catch (e) {
        if (e.code === 401) {
          finishJob(job, "failed", e.message);
          break;
        }
        if (++misses > 6) {
          finishJob(job, "failed", e.message);
          break;
        }
        continue;
      }
      if (!d) continue;
      try {
        handleJobData(job, d);
      } catch (e) {
        console.error(e);
      }
    }
  }

  function handleJobData(job, d) {
    const status = d.status || d.successFlag || "PENDING";
    job.stage = status;
    if (job.type === "music") {
      const tracks = d.response?.sunoData || [];
      const usable = tracks.filter((t) => t.audio_url || t.stream_audio_url || t.streamAudioUrl || t.audioUrl);
      if (usable.length) {
        const added = usable.map((t) => upsertTrack(t, d, job));
        if (!job.announced) {
          job.announced = true;
          toast(`🎧 "${added[0].title}" is ready to play`, "good");
          if (!state.current) playTrack(added[0].id, false);
        }
      }
      if (status === "SUCCESS" || (status === "CALLBACK_EXCEPTION" && tracks.some((t) => t.audio_url))) {
        finishJob(job, "done", `${tracks.length} track${tracks.length === 1 ? "" : "s"} added to your library`);
        refreshCredits().catch(() => {});
        return;
      }
    } else if (job.type === "lyrics") {
      const items = d.response?.data || [];
      if (status === "SUCCESS" || (items.length && items.every((i) => i.status === "complete"))) {
        finishJob(job, "done", "Lyrics ready");
        job.onDone?.(items);
        refreshCredits().catch(() => {});
        return;
      }
    } else {
      if (status === "SUCCESS") {
        finishJob(job, "done", "Ready");
        applyExtra(job, d.response || {});
        refreshCredits().catch(() => {});
        return;
      }
    }
    if (FAIL_STATES.has(status) || /FAIL/.test(status)) {
      const msg = d.errorMessage || (status === "SENSITIVE_WORD_ERROR" ? "Your text contains words the model can't use. Try rephrasing." : "Generation failed. Try adjusting your prompt.");
      finishJob(job, "failed", msg);
      job.onFail?.(msg);
      return;
    }
    renderJobs();
  }

  function finishJob(job, status, msg) {
    job.status = status;
    job.msg = msg;
    if (status === "done") job.stage = "SUCCESS";
    saveJobs();
    renderJobs();
    if (status === "failed") toast(`${job.label}: ${msg}`, "bad");
    // Auto-hide finished jobs after a while.
    setTimeout(() => {
      state.jobs = state.jobs.filter((j) => j !== job);
      renderJobs();
    }, status === "done" ? 20000 : 60000);
  }

  const TYPE_LABEL = { music: "🎵", lyrics: "✍️", stems: "🎛️", wav: "💿", video: "🎬" };
  function renderJobs() {
    const el = $("#jobsList");
    if (!state.jobs.length) {
      el.innerHTML = `<p class="empty">Nothing cooking yet. Your songs will show up here as they're made — usually playable within ~30 seconds.</p>`;
      return;
    }
    el.innerHTML = state.jobs
      .map((j) => {
        const info = STATUS_INFO[j.stage] || STATUS_INFO.PENDING;
        const pct = j.status === "done" ? 100 : j.status === "failed" ? 100 : info.pct;
        const stateLabel = j.status === "done" ? "✓ Done" : j.status === "failed" ? "Failed" : info.label;
        const msg = j.status === "running" ? (j.type === "music" ? info.msg : "Processing…") : j.msg || "";
        return `<div class="job ${j.status}">
          <div class="job-head"><div class="job-title">${TYPE_LABEL[j.type] || ""} ${esc(j.label)}</div>
          <div class="job-state">${j.status === "running" ? '<span class="eq"><i></i><i></i><i></i></span>' : ""}${stateLabel}</div></div>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <div class="job-msg">${esc(msg)}</div></div>`;
      })
      .join("");
  }

  // ============ Library ============
  function upsertTrack(t, d, job) {
    const id = t.id || t.audioId;
    let tr = state.library.find((x) => x.id === id);
    const fields = {
      id,
      taskId: d.taskId || job.taskId,
      title: t.title || job.label || "Untitled",
      tags: t.tags || "",
      lyrics: t.prompt || "",
      image: safeUrl(t.image_url || t.imageUrl || t.source_image_url),
      audio: safeUrl(t.audio_url || t.audioUrl || t.source_audio_url),
      stream: safeUrl(t.stream_audio_url || t.streamAudioUrl || t.source_stream_audio_url),
      duration: Number(t.duration) || 0,
      model: t.model_name || t.modelName || job.meta?.model || "",
      kind: job.meta?.kind || "Original",
    };
    if (tr) {
      for (const [k, v] of Object.entries(fields)) if (v) tr[k] = v;
    } else {
      tr = { ...fields, createdAt: Date.now(), fav: false, extras: {} };
      state.library.unshift(tr);
    }
    saveLibrary();
    return tr;
  }
  function saveLibrary() {
    store.set("library", state.library.slice(0, 300));
    renderLibrary();
    renderRecent();
    if (state.current) syncPlayerMeta();
  }
  const trackById = (id) => state.library.find((t) => t.id === id);
  const trackSrc = (t) => t.audio || t.stream;

  function coverHtml(t, cls = "") {
    return t.image ? `<img src="${esc(t.image)}" alt="" loading="lazy" class="${cls}" />` : `<div class="ph ${cls}">♪</div>`;
  }

  function renderRecent() {
    const el = $("#recentList");
    const items = state.library.slice(0, 6);
    el.innerHTML = items.length
      ? items
          .map(
            (t) => `<div class="mini-track" data-play="${esc(t.id)}" role="button" tabindex="0">
          ${coverHtml(t)}<div class="mt-meta"><div class="mt-title">${esc(t.title)}</div><div class="mt-sub">${esc(t.tags || t.kind)}</div></div>
          <span>${state.current === t.id && !$("#audio").paused ? "⏸" : "▶"}</span></div>`
          )
          .join("")
      : `<p class="empty">Your newest tracks will appear here.</p>`;
  }

  function renderLibrary() {
    $("#libCount").textContent = state.library.length;
    const q = state.libQuery.toLowerCase();
    const list = state.library.filter(
      (t) => (state.libFilter === "all" || t.fav) && (!q || [t.title, t.tags, t.lyrics].some((s) => (s || "").toLowerCase().includes(q)))
    );
    $("#libEmpty").hidden = state.library.length > 0;
    $("#libGrid").innerHTML = list
      .map((t) => {
        const playing = state.current === t.id && !$("#audio").paused;
        const pending = !t.audio;
        return `<article class="track ${state.current === t.id ? "playing" : ""}">
          <div class="t-cover">${coverHtml(t)}
            <span class="t-badge">${esc(t.kind)}${pending ? " · streaming" : ""}</span>
            <button class="t-fav ${t.fav ? "on" : ""}" data-fav="${esc(t.id)}" aria-label="Favourite">${t.fav ? "★" : "☆"}</button>
            <button class="t-play" data-play="${esc(t.id)}" aria-label="Play">${playing ? "⏸" : "▶"}</button>
          </div>
          <div class="t-body">
            <div class="t-title" title="${esc(t.title)}">${esc(t.title)}</div>
            <div class="t-tags">${esc(t.tags || "—")}</div>
            <div class="t-meta"><span>${t.duration ? fmtTime(t.duration) : ""}</span><span>${esc(t.model)}</span></div>
            <div class="t-actions">
              <button data-act="download" data-id="${esc(t.id)}" ${pending ? "disabled" : ""}>⬇ MP3</button>
              <button data-act="extend" data-id="${esc(t.id)}">➕ Extend</button>
              <button data-act="lyrics" data-id="${esc(t.id)}">🎤 Sing</button>
              <button data-act="more" data-id="${esc(t.id)}">⋯ More</button>
            </div>
          </div></article>`;
      })
      .join("");
    if (state.library.length && !list.length) $("#libGrid").innerHTML = `<p class="empty">No tracks match.</p>`;
  }
  $("#libSearch").addEventListener("input", (e) => {
    state.libQuery = e.target.value;
    renderLibrary();
  });
  segment("#libFilter", "filter", (f) => {
    state.libFilter = f;
    renderLibrary();
  });

  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-play]");
    if (p) return togglePlay(p.dataset.play);
    const f = e.target.closest("[data-fav]");
    if (f) {
      const t = trackById(f.dataset.fav);
      t.fav = !t.fav;
      return saveLibrary();
    }
    const a = e.target.closest("[data-act]");
    if (a) return trackAction(a.dataset.act, a.dataset.id);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".mini-track")) {
      e.preventDefault();
      togglePlay(e.target.dataset.play);
    }
  });

  async function download(url, name) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      window.open(url, "_blank", "noopener");
    }
  }
  const fileName = (t, ext) => `${(t.title || "track").replace(/[^\w\- ]+/g, "").trim() || "track"}.${ext}`;

  function trackAction(act, id) {
    const t = trackById(id);
    if (!t) return;
    if (act === "download") return download(t.audio, fileName(t, "mp3"));
    if (act === "extend") return openExtend(t);
    if (act === "lyrics") return openKaraoke(t);
    if (act === "more") return openMore(t);
  }

  // ============ Modal ============
  const modal = $("#modal");
  function openModal(html) {
    $("#modalBody").innerHTML = html;
    if (!modal.open) modal.showModal();
    return $("#modalBody");
  }
  function closeModal() {
    if (modal.open) modal.close();
  }
  $("#modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  modal.addEventListener("close", () => {
    karaokeStop?.();
    $("#modalBody").innerHTML = "";
  });

  function openMore(t) {
    const x = t.extras || {};
    const body = openModal(`
      <h2>${esc(t.title)}</h2>
      <p class="modal-sub">${esc(t.tags)}</p>
      <div class="result-list">
        <div class="result-row"><b>🎛️ Split into stems</b><span class="hint">vocals, drums, bass…</span><button class="btn btn-primary" data-m="stems">Open</button></div>
        <div class="result-row"><b>💿 Studio-quality WAV</b>${x.wav ? `<button class="btn btn-ghost" data-dl="${esc(x.wav)}" data-name="${esc(fileName(t, "wav"))}">⬇ Download</button>` : `<button class="btn btn-primary" data-m="wav">Convert</button>`}</div>
        <div class="result-row"><b>🎬 Music video</b>${x.video ? `<button class="btn btn-ghost" data-m="showvideo">▶ Watch</button>` : `<button class="btn btn-primary" data-m="video">Create</button>`}</div>
        <div class="result-row"><b>🎭 Cover in a new style</b><button class="btn btn-primary" data-m="cover">Remix</button></div>
        <div class="result-row"><b>♻️ Reuse this style</b><button class="btn btn-ghost" data-m="reuse">Use</button></div>
        <div class="result-row"><b>📋 Copy lyrics</b><button class="btn btn-ghost" data-m="copy" ${t.lyrics ? "" : "disabled"}>Copy</button></div>
        <div class="result-row"><b>🗑️ Remove from library</b><button class="btn btn-ghost" data-m="delete">Remove</button></div>
      </div>`);
    body.addEventListener("click", async (e) => {
      const dl = e.target.closest("[data-dl]");
      if (dl) return download(dl.dataset.dl, dl.dataset.name);
      const m = e.target.closest("[data-m]")?.dataset.m;
      if (!m) return;
      if (m === "stems") return openStems(t);
      if (m === "wav") return startExtra(t, "wav", e.target.closest("button"));
      if (m === "video") return startExtra(t, "video", e.target.closest("button"));
      if (m === "showvideo") return showVideo(t);
      if (m === "cover") {
        closeModal();
        return prefillRemix(t);
      }
      if (m === "reuse") {
        closeModal();
        setSeg("#modeSeg", "mode", "custom");
        state.mode = "custom";
        $(".mode-simple").hidden = true;
        $(".mode-custom").hidden = false;
        $("#cStyle").value = t.tags || "";
        $("#cStyle").dispatchEvent(new Event("input"));
        updateCounters();
        go("create");
        return toast("Style loaded — write new lyrics and create!");
      }
      if (m === "copy") {
        navigator.clipboard?.writeText(t.lyrics).then(() => toast("Lyrics copied", "good"));
        return;
      }
      if (m === "delete") {
        if (!confirm(`Remove "${t.title}" from your library?`)) return;
        state.library = state.library.filter((x) => x.id !== t.id);
        if (state.current === t.id) {
          $("#audio").pause();
          state.current = null;
          $("#player").hidden = true;
        }
        saveLibrary();
        closeModal();
      }
    });
  }

  async function startExtra(t, type, btn) {
    const path = type === "wav" ? "/api/v1/wav/generate" : "/api/v1/mp4/generate";
    const body = { taskId: t.taskId, audioId: t.id, callBackUrl: CALLBACK_URL };
    if (type === "video") body.author = "Songsmith Studio";
    if (btn) setLoading(btn, true);
    try {
      const d = await api(path, { method: "POST", body });
      startJob({ type, taskId: d.taskId, label: `${t.title} → ${type === "wav" ? "WAV" : "video"}`, meta: { trackId: t.id } });
      toast(type === "wav" ? "Converting to WAV… we'll let you know." : "Rendering your music video… this can take a minute or two.");
      closeModal();
    } catch (e) {
      toast(e.message, "bad");
      if (btn) setLoading(btn, false);
    }
  }

  function applyExtra(job, resp) {
    const t = trackById(job.meta?.trackId);
    if (!t) return;
    t.extras ||= {};
    if (job.type === "wav" && resp.audioWavUrl) {
      t.extras.wav = safeUrl(resp.audioWavUrl);
      toast(`💿 WAV ready for "${t.title}"`, "good");
    }
    if (job.type === "video" && resp.videoUrl) {
      t.extras.video = safeUrl(resp.videoUrl);
      toast(`🎬 Video ready for "${t.title}"`, "good");
    }
    if (job.type === "stems") {
      t.extras.stems = collectStems(resp);
      toast(`🎛️ Stems ready for "${t.title}"`, "good");
      if (modal.open && $("#stemsView")?.dataset.id === t.id) renderStemResults(t);
    }
    saveLibrary();
  }

  function showVideo(t) {
    openModal(`<h2>🎬 ${esc(t.title)}</h2>
      <video class="modal-video" src="${esc(t.extras.video)}" controls autoplay playsinline></video>
      <div class="lyric-actions" style="margin-top:12px"><button class="btn btn-primary" id="dlVideo">⬇ Download MP4</button></div>`);
    $("#audio").pause();
    $("#dlVideo").addEventListener("click", () => download(t.extras.video, fileName(t, "mp4")));
  }

  // ---------- Stems ----------
  const STEM_KEYS = {
    vocalUrl: "Vocals", instrumentalUrl: "Instrumental", backingVocalsUrl: "Backing vocals", drumsUrl: "Drums", bassUrl: "Bass",
    guitarUrl: "Guitar", keyboardUrl: "Keyboard", percussionUrl: "Percussion", stringsUrl: "Strings", synthUrl: "Synth",
    fxUrl: "FX", brassUrl: "Brass", woodwindsUrl: "Woodwinds",
  };
  function collectStems(resp) {
    const out = [];
    const seen = new Set();
    for (const [k, name] of Object.entries(STEM_KEYS)) {
      const u = safeUrl(resp[k]);
      if (u && !seen.has(u)) {
        seen.add(u);
        out.push({ name, url: u });
      }
    }
    for (const o of resp.originData || []) {
      const u = safeUrl(o.audio_url);
      if (u && !seen.has(u)) {
        seen.add(u);
        out.push({ name: o.stem_type_group_name || "Stem", url: u });
      }
    }
    return out;
  }
  const ADV_STEMS = ["Lead Vocal", "Backing Vocals", "Drum Kit", "Bass", "Piano", "Electric Guitar", "Acoustic Guitar", "Synth", "Strings", "Percussion", "Kick", "Snare", "Hi-Hat", "808", "Brass Section", "Choir", "Organ", "Saxophone", "Violin", "Cello", "Flute", "Trumpet"];
  function openStems(t) {
    const body = openModal(`
      <h2 id="stemsView" data-id="${esc(t.id)}">🎛️ Stems · ${esc(t.title)}</h2>
      <p class="modal-sub">Split the song into separate parts for remixing, karaoke, or production.</p>
      <div class="opt-list">
        <label class="opt"><input type="radio" name="stype" value="separate_vocal" checked /><div><b>Vocals + Instrumental</b><span>Two clean tracks — perfect for karaoke</span></div></label>
        <label class="opt"><input type="radio" name="stype" value="split_stem" /><div><b>Full stem split</b><span>Vocals, drums, bass, guitar, keys, and more</span></div></label>
        <label class="opt"><input type="radio" name="stype" value="split_stem_advanced" /><div><b>Isolate one instrument</b><span>Pick exactly what you want to pull out</span></div></label>
      </div>
      <div id="advStem" hidden><label class="label" for="stemName">Instrument</label><select id="stemName">${ADV_STEMS.map((s) => `<option>${s}</option>`).join("")}</select></div>
      <button class="btn btn-primary btn-block" id="stemGo"><span class="btn-label">Separate</span></button>
      <div id="stemResults"></div>`);
    body.addEventListener("change", (e) => {
      if (e.target.name === "stype") $("#advStem").hidden = e.target.value !== "split_stem_advanced";
    });
    $("#stemGo").addEventListener("click", async () => {
      const type = $("input[name=stype]:checked").value;
      const req = { taskId: t.taskId, audioId: t.id, type, callBackUrl: CALLBACK_URL };
      if (type === "split_stem_advanced") req.stemName = $("#stemName").value;
      const btn = $("#stemGo");
      setLoading(btn, true);
      try {
        const d = await api("/api/v1/vocal-removal/generate", { method: "POST", body: req });
        startJob({ type: "stems", taskId: d.taskId, label: `${t.title} → stems`, meta: { trackId: t.id } });
        $("#stemResults").innerHTML = `<p class="hint center" style="margin-top:12px"><span class="eq"><i></i><i></i><i></i></span> Separating… you can close this — we'll notify you.</p>`;
      } catch (e) {
        toast(e.message, "bad");
      } finally {
        setLoading(btn, false);
      }
    });
    if (t.extras?.stems?.length) renderStemResults(t);
  }
  function renderStemResults(t) {
    const el = $("#stemResults");
    if (!el) return;
    el.innerHTML = `<div class="result-list">${t.extras.stems
      .map(
        (s, i) => `<div class="result-row"><b>${esc(s.name)}</b>
          <button class="btn btn-ghost" data-stem-play="${i}">▶</button>
          <button class="btn btn-ghost" data-stem-dl="${i}">⬇</button></div>`
      )
      .join("")}</div>`;
    el.onclick = (e) => {
      const p = e.target.closest("[data-stem-play]");
      const d = e.target.closest("[data-stem-dl]");
      if (p) {
        const s = t.extras.stems[p.dataset.stemPlay];
        playUrl(s.url, `${t.title} · ${s.name}`, t.image);
      }
      if (d) {
        const s = t.extras.stems[d.dataset.stemDl];
        download(s.url, `${t.title} - ${s.name}.mp3`);
      }
    };
  }

  // ---------- Extend ----------
  function openExtend(t) {
    const dur = Math.floor(t.duration || 0);
    openModal(`
      <h2>➕ Extend · ${esc(t.title)}</h2>
      <p class="modal-sub">Continue the song from any point. Leave everything blank to let the AI carry on in the same style.</p>
      <form id="extForm">
        <label class="label" for="eAt">Continue from <output id="eAtOut">${dur ? fmtTime(Math.max(dur - 1, 1)) : "end"}</output></label>
        <input type="range" id="eAt" min="1" max="${Math.max(dur - 1, 1)}" value="${Math.max(dur - 1, 1)}" ${dur ? "" : "disabled"} />
        <label class="label" for="eStyle">Style <span class="hint">optional</span></label>
        <input id="eStyle" type="text" maxlength="1000" value="${esc(t.tags)}" />
        <label class="label" for="eTitle">Title <span class="hint">optional</span></label>
        <input id="eTitle" type="text" maxlength="100" value="${esc(t.title)} (Extended)" />
        <label class="label" for="eLyrics">Lyrics for the new part <span class="hint">optional</span></label>
        <textarea id="eLyrics" rows="5" maxlength="5000" placeholder="[Bridge]&#10;…"></textarea>
        <label class="switch" style="margin-top:14px"><input type="checkbox" id="eInstr" /><span class="slider"></span><span>Instrumental continuation</span></label>
        <p id="extErr" class="error" hidden></p>
        <button class="btn btn-primary btn-block" id="extGo" type="submit"><span class="btn-label">➕ Extend song</span></button>
      </form>`);
    $("#eAt").addEventListener("input", (e) => ($("#eAtOut").textContent = fmtTime(e.target.value)));
    $("#extForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const model = /^V\d/.test(state.model) ? state.model : "V6";
      const style = $("#eStyle").value.trim();
      const title = $("#eTitle").value.trim();
      const lyrics = $("#eLyrics").value.trim();
      const instrumental = $("#eInstr").checked;
      const body = { audioId: t.id, taskId: t.taskId, model, callBackUrl: CALLBACK_URL, instrumental };
      const custom = !!(style || title || lyrics || dur);
      body.defaultParamFlag = custom;
      if (dur) body.continueAt = Number($("#eAt").value);
      if (style) body.style = style;
      if (title) body.title = title.slice(0, 100);
      if (lyrics && !instrumental) {
        body.lyrics = lyrics;
        body.prompt = lyrics;
      }
      const btn = $("#extGo");
      setLoading(btn, true);
      try {
        const d = await api("/api/v1/generate/extend", { method: "POST", body });
        startJob({ type: "music", taskId: d.taskId, label: title || `${t.title} (Extended)`, meta: { model, kind: "Extended" } });
        closeModal();
        toast("Extending your song… 🎶");
        go("create");
      } catch (x) {
        showError($("#extErr"), x.message);
      } finally {
        setLoading(btn, false);
      }
    });
  }

  // ---------- Karaoke / timestamped lyrics ----------
  let karaokeStop = null;
  async function openKaraoke(t) {
    openModal(`<h2>🎤 ${esc(t.title)}</h2><p class="modal-sub">Sing along — words light up in time with the music. Click a word to jump there.</p>
      <div class="karaoke" id="karaoke"><p class="hint"><span class="eq"><i></i><i></i><i></i></span> Syncing lyrics…</p></div>`);
    let words = [];
    try {
      const d = await api("/api/v1/generate/get-timestamped-lyrics", { method: "POST", body: { taskId: t.taskId, audioId: t.id } });
      words = (d?.alignedWords || []).filter((w) => w.word);
    } catch (e) {
      /* fall through to plain lyrics */
    }
    const box = $("#karaoke");
    if (!box) return;
    if (!words.length) {
      box.innerHTML = t.lyrics
        ? `<div style="white-space:pre-wrap;font-size:1rem;font-weight:500">${esc(t.lyrics)}</div>`
        : `<p class="hint">No lyrics for this track${/instrumental/i.test(t.tags) ? " — it's instrumental" : ""}.</p>`;
      if (state.current !== t.id) playTrack(t.id);
      return;
    }
    box.innerHTML = words
      .map((w, i) => {
        const m = w.word.match(/^\s*(\[[^\]]+\])\s*([\s\S]*)$/);
        const sec = m ? `<span class="sec">${esc(m[1].slice(1, -1))}</span>` : "";
        const txt = (m ? m[2] : w.word).replace(/\n/g, " ");
        const br = /\n\s*$/.test(w.word) ? "<br>" : "";
        return `${sec}<span class="w" data-i="${i}" data-s="${w.startS}">${esc(txt)} </span>${br}`;
      })
      .join("");
    const spans = $$(".w", box);
    const audio = $("#audio");
    if (state.current !== t.id) playTrack(t.id);
    box.addEventListener("click", (e) => {
      const w = e.target.closest(".w");
      if (w) {
        audio.currentTime = Number(w.dataset.s);
        audio.play().catch(() => {});
      }
    });
    let last = -1;
    const tick = () => {
      if (state.current !== t.id) return;
      const ct = audio.currentTime;
      let idx = -1;
      for (let i = 0; i < words.length; i++) {
        if (words[i].startS <= ct) idx = i;
        else break;
      }
      if (idx !== last) {
        spans.forEach((s, i) => {
          s.classList.toggle("past", i < idx);
          s.classList.toggle("now", i === idx);
        });
        if (idx >= 0) {
          const el = spans[idx];
          const top = el.offsetTop - box.offsetTop - box.clientHeight / 2;
          box.scrollTop = Math.max(0, top);
        }
        last = idx;
      }
    };
    audio.addEventListener("timeupdate", tick);
    karaokeStop = () => {
      audio.removeEventListener("timeupdate", tick);
      karaokeStop = null;
    };
  }

  // ============ Lyrics lab ============
  chipRow($("#lyricIdeas"), LYRIC_IDEAS, (v) => {
    $("#lPrompt").value = v;
    updateCounters();
  });
  $("#lyricsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = $("#lPrompt").value.trim();
    const err = $("#lyricsError");
    showError(err, "");
    if (!prompt) return showError(err, "Tell us what the song is about.");
    const btn = $("#lyricsBtn");
    setLoading(btn, true);
    $("#lyricsResults").innerHTML = `<div class="card center"><span class="eq"><i></i><i></i><i></i></span> Writing verses and hooks…</div>`;
    try {
      const d = await api("/api/v1/lyrics", { method: "POST", body: { prompt, callBackUrl: CALLBACK_URL } });
      const job = startJob({ type: "lyrics", taskId: d.taskId, label: prompt });
      job.onDone = (items) => {
        setLoading(btn, false);
        renderLyricResults(items);
      };
      job.onFail = (msg) => {
        setLoading(btn, false);
        $("#lyricsResults").innerHTML = "";
        showError(err, msg);
      };
    } catch (x) {
      setLoading(btn, false);
      $("#lyricsResults").innerHTML = "";
      showError(err, x.message);
    }
  });
  function renderLyricResults(items) {
    const ok = items.filter((i) => i.text);
    const el = $("#lyricsResults");
    if (!ok.length) {
      el.innerHTML = `<div class="card center muted">No lyrics came back — try a different idea.</div>`;
      return;
    }
    el.innerHTML = ok
      .map(
        (it, i) => `<div class="card lyric-card"><h3><span>${esc(it.title || `Draft ${i + 1}`)}</span><span class="hint">Draft ${i + 1}</span></h3>
        <pre class="lyric-text">${esc(it.text)}</pre>
        <div class="lyric-actions">
          <button class="btn btn-primary btn-sm" data-use="${i}">🎵 Use in a song</button>
          <button class="btn btn-ghost btn-sm" data-copy="${i}">📋 Copy</button>
        </div></div>`
      )
      .join("");
    el.onclick = (e) => {
      const u = e.target.closest("[data-use]");
      const c = e.target.closest("[data-copy]");
      if (c) navigator.clipboard?.writeText(ok[c.dataset.copy].text).then(() => toast("Copied", "good"));
      if (u) {
        const it = ok[u.dataset.use];
        state.mode = "custom";
        setSeg("#modeSeg", "mode", "custom");
        $(".mode-simple").hidden = true;
        $(".mode-custom").hidden = false;
        $("#cLyrics").value = it.text;
        if (it.title) $("#cTitle").value = it.title.slice(0, 80);
        $("#instrumental").checked = false;
        updateCounters();
        go("create");
        $("#cStyle").focus();
        toast("Lyrics loaded — pick a style and hit Create!", "good");
      }
    };
  }

  // ============ Remix ============
  const REMIX_CFG = {
    cover: { btn: "🎭 Create cover", styleHint: "what should it become?", negHint: "optional", lyricsHint: "optional — replaces the original words", showLyrics: true, showInstr: true },
    vocals: { btn: "🎤 Add vocals", styleHint: "required — genre & vocal approach", negHint: "required — what to avoid", lyricsHint: "what should be sung?", showLyrics: true, showInstr: false },
    instrumental: { btn: "🎸 Add instrumental", styleHint: "required — backing style", negHint: "required — what to avoid", lyricsHint: "", showLyrics: false, showInstr: false },
  };
  function setRemixType(type) {
    state.remixType = type;
    $$(".remix-type").forEach((b) => b.classList.toggle("active", b.dataset.remix === type));
    const c = REMIX_CFG[type];
    $("#remixBtn .btn-label").textContent = c.btn;
    $("#rStyleHint").textContent = c.styleHint;
    $("#rNegHint").textContent = c.negHint;
    $("#rLyricsHint").textContent = c.lyricsHint;
    $(".r-lyrics").hidden = !c.showLyrics;
    $(".r-instrumental").hidden = !c.showInstr;
  }
  $$(".remix-type").forEach((b) => b.addEventListener("click", () => setRemixType(b.dataset.remix)));
  segment("#rVocalSeg", "vocal", (v) => (state.remixVocal = v));

  const dz = $("#dropzone");
  function setRemixFile(f) {
    state.remixFile = f;
    $(".dz-empty", dz).hidden = !!f;
    $(".dz-file", dz).hidden = !f;
    $("#dzName").textContent = f ? `🎵 ${f.name} (${(f.size / 1048576).toFixed(1)} MB)` : "";
    if (f && !$("#rTitle").value) $("#rTitle").value = f.name.replace(/\.[^.]+$/, "").slice(0, 80);
  }
  dz.addEventListener("click", (e) => {
    if (!e.target.closest("#dzClear")) $("#remixFile").click();
  });
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $("#remixFile").click();
    }
  });
  $("#remixFile").addEventListener("change", (e) => setRemixFile(e.target.files[0] || null));
  $("#dzClear").addEventListener("click", (e) => {
    e.stopPropagation();
    setRemixFile(null);
    $("#remixFile").value = "";
  });
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove("drag")));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("audio")) setRemixFile(f);
    else toast("Please drop an audio file.", "bad");
  });

  function prefillRemix(t) {
    setRemixType("cover");
    setRemixFile(null);
    $("#remixUrl").value = t.audio || t.stream;
    $("#rTitle").value = `${t.title} (Cover)`.slice(0, 80);
    $("#rStyle").value = "";
    go("remix");
    $("#rStyle").focus();
    toast("Track loaded — choose a new style!");
  }

  $("#remixForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#remixError");
    showError(err, "");
    const type = state.remixType;
    const title = $("#rTitle").value.trim();
    const style = $("#rStyle").value.trim();
    const negativeTags = $("#rNegative").value.trim();
    const lyrics = $("#rLyrics").value.trim();
    const instrumental = $("#rInstrumental").checked;
    const urlIn = $("#remixUrl").value.trim();
    if (!state.remixFile && !safeUrl(urlIn)) return showError(err, "Add a source audio file or paste a public URL.");
    if (type !== "cover") {
      if (!title) return showError(err, "Give your track a title.");
      if (!style) return showError(err, "Describe the style you want.");
      if (!negativeTags) return showError(err, "Add at least one thing to avoid (e.g. “screaming”).");
    } else if (!style && !lyrics) return showError(err, "Describe the new style (or add new lyrics).");

    const btn = $("#remixBtn");
    setLoading(btn, true);
    try {
      let uploadUrl = safeUrl(urlIn);
      if (state.remixFile) {
        toast("Uploading your audio…");
        uploadUrl = await uploadFile(state.remixFile);
      }
      const model = state.remixModel;
      const body = { uploadUrl, model, callBackUrl: CALLBACK_URL };
      let path;
      if (type === "cover") {
        path = "/api/v1/generate/upload-cover";
        Object.assign(body, { customMode: true, instrumental });
        if (title) body.title = title;
        if (style) body.style = style;
        if (lyrics && !instrumental) {
          body.lyrics = lyrics;
          body.prompt = lyrics;
        }
      } else if (type === "vocals") {
        path = "/api/v1/generate/add-vocals";
        Object.assign(body, { title, style, negativeTags });
        if (lyrics) {
          body.lyrics = lyrics;
          body.prompt = lyrics;
        }
      } else {
        path = "/api/v1/generate/add-instrumental";
        Object.assign(body, { title, tags: style, negativeTags });
      }
      if (type === "cover" && negativeTags) body.negativeTags = negativeTags;
      if (state.remixVocal && !(type === "cover" && instrumental)) body.vocalGender = state.remixVocal;
      const d = await api(path, { method: "POST", body });
      const kind = { cover: "Cover", vocals: "+Vocals", instrumental: "+Band" }[type];
      startJob({ type: "music", taskId: d.taskId, label: title || kind, meta: { model, kind } });
      toast("Remix in progress 🎚️ — track it on the Create tab.");
      go("create");
    } catch (x) {
      showError(err, x.message);
    } finally {
      setLoading(btn, false);
    }
  });

  // ============ Player ============
  const audio = $("#audio");
  function queueList() {
    return state.library.filter((t) => trackSrc(t));
  }
  function syncPlayerMeta() {
    const t = trackById(state.current);
    if (!t) return;
    $("#pTitle").textContent = t.title;
    $("#pSub").textContent = t.tags || t.kind;
    if (t.image) $("#pCover").src = t.image;
    else $("#pCover").removeAttribute("src");
  }
  function playTrack(id, autoplay = true) {
    const t = trackById(id);
    if (!t || !trackSrc(t)) return toast("This track isn't playable yet — hang tight.", "bad");
    state.current = id;
    $("#player").hidden = false;
    // Streamed tracks may later get a final audio URL; always prefer the final file.
    audio.src = trackSrc(t);
    syncPlayerMeta();
    if (autoplay) audio.play().catch(() => {});
    renderLibrary();
    renderRecent();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: "Songsmith Studio", artwork: t.image ? [{ src: t.image, sizes: "512x512" }] : [] });
    }
  }
  function playUrl(url, title, image) {
    state.current = null;
    $("#player").hidden = false;
    audio.src = url;
    $("#pTitle").textContent = title;
    $("#pSub").textContent = "Stem preview";
    if (image) $("#pCover").src = image;
    audio.play().catch(() => {});
  }
  function togglePlay(id) {
    if (state.current === id && audio.src) {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    } else playTrack(id);
  }
  function step(dir) {
    const q = queueList();
    if (!q.length) return;
    const i = q.findIndex((t) => t.id === state.current);
    const n = q[(i + dir + q.length) % q.length];
    playTrack(n.id);
  }
  $("#pPlay").addEventListener("click", () => {
    if (!audio.src) return;
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  });
  $("#pPrev").addEventListener("click", () => (audio.currentTime > 3 ? (audio.currentTime = 0) : step(-1)));
  $("#pNext").addEventListener("click", () => step(1));
  $("#pLyrics").addEventListener("click", () => {
    const t = trackById(state.current);
    if (t) openKaraoke(t);
  });
  $("#pVol").addEventListener("input", (e) => (audio.volume = e.target.value / 100));
  audio.volume = 0.9;
  let seeking = false;
  $("#pSeek").addEventListener("input", (e) => {
    seeking = true;
    if (isFinite(audio.duration)) $("#pCur").textContent = fmtTime((e.target.value / 1000) * audio.duration);
  });
  $("#pSeek").addEventListener("change", (e) => {
    if (isFinite(audio.duration)) audio.currentTime = (e.target.value / 1000) * audio.duration;
    seeking = false;
  });
  audio.addEventListener("timeupdate", () => {
    const dur = isFinite(audio.duration) ? audio.duration : trackById(state.current)?.duration || 0;
    if (!seeking && dur) $("#pSeek").value = (audio.currentTime / dur) * 1000;
    if (!seeking) $("#pCur").textContent = fmtTime(audio.currentTime);
    $("#pDur").textContent = fmtTime(dur);
  });
  const onPlayState = () => {
    $("#pPlay").textContent = audio.paused ? "▶" : "⏸";
    renderLibrary();
    renderRecent();
  };
  audio.addEventListener("play", onPlayState);
  audio.addEventListener("pause", onPlayState);
  audio.addEventListener("ended", () => {
    if (state.current) step(1);
  });
  audio.addEventListener("error", () => {
    const t = trackById(state.current);
    // If the streaming URL failed but a final URL exists, retry with it.
    if (t && t.audio && audio.src !== t.audio) {
      audio.src = t.audio;
      audio.play().catch(() => {});
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.target.closest("input, textarea, select, button, [contenteditable], dialog") || !audio.src) return;
    e.preventDefault();
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
  }

  // ============ Init ============
  chipRow($("#ideaChips"), IDEAS, (v) => {
    $("#sPrompt").value = v;
    updateCounters();
    $("#sPrompt").focus();
  });
  chipRow($("#vibeChips"), VIBES, null, { toggle: true, input: $("#sStyle") });
  chipRow($("#styleChips"), [...VIBES.slice(0, 8), ...STYLE_TAGS], null, { toggle: true, input: $("#cStyle") });
  chipRow($("#rStyleChips"), ["Lo-fi", "Jazz", "Acoustic", "Orchestral", "Rock", "EDM", "Reggae", "Gospel choir", "Synthwave", "Bossa nova"], null, { toggle: true, input: $("#rStyle") });
  pickModel(MODELS.concat(LEGACY_MODELS).some((m) => m.id === state.model) ? state.model : "V6");
  pickRemixModel("V6");
  setRemixType("cover");
  applyTheme((() => { try { return localStorage.getItem("ss.theme"); } catch (e) { return null; } })() || "system");
  updateCounters();
  renderRefs();

  if (getKey()) {
    showApp();
    refreshCredits().catch((e) => {
      if (e.code === 401) {
        clearKey();
        showGate("Your saved key is no longer valid. Please enter a new one.");
      }
    });
  } else showGate();
})();
