var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/config.ts
var config = {
  predict: true,
  prefetch: "viewport",
  poolSize: 4,
  lookaheadMs: 180,
  size: "auto",
  codec: "auto",
  mse: true
};
function configure(patch) {
  Object.assign(config, patch);
}

// src/env.ts
var conn = () => navigator.connection;
function prefetchLimit() {
  const value = config.prefetch;
  if (value === false || value === "none" || value === 0 || typeof matchMedia === "undefined") return 0;
  const c = conn();
  if (c?.saveData || c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return 0;
  if (matchMedia("(hover: none), (pointer: coarse)").matches) return 0;
  return typeof value === "number" ? Math.max(0, Math.floor(value)) : 4;
}
function quality() {
  if (typeof matchMedia === "undefined") return "off";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return "off";
  const c = conn();
  if (c?.saveData) return "off";
  if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return "off";
  if (config.size !== "auto") return config.size;
  if (c?.effectiveType === "3g" || c?.downlink !== void 0 && c.downlink > 0 && c.downlink < 1.5) return "s";
  return "m";
}
var MS = typeof window === "undefined" ? void 0 : window.ManagedMediaSource ?? window.MediaSource;
var canMse = (mime) => config.mse && !!MS && MS.isTypeSupported(mime);

// src/codec.ts
var mimeOf = (r) => `video/mp4; codecs="${r.codec}"`;
var av1 = {};
function probeCodecs(src) {
  const mc = navigator.mediaCapabilities;
  for (const size of ["m", "s"]) {
    const r = src.r[size]?.av1;
    if (!r || size in av1) continue;
    av1[size] = false;
    if (!mc || !canMse(mimeOf(r))) continue;
    mc.decodingInfo({
      type: "media-source",
      video: { contentType: mimeOf(r), width: src.w, height: src.h, bitrate: Math.round((r.headBytes + r.tailBytes) * 8 / src.dur), framerate: 25 }
    }).then((i) => av1[size] = i.supported && i.smooth && i.powerEfficient).catch(() => {
    });
  }
}
function pick(src) {
  const q = quality();
  if (q === "off") return null;
  const sizes = q === "s" ? ["s", "m"] : ["m", "s"];
  for (const size of sizes) {
    const set = src.r[size];
    if (!set) continue;
    const kinds = config.codec === "av1" || config.codec === "auto" && av1[size] ? ["av1", "avc"] : config.codec === "avc" ? ["avc"] : ["avc", "av1"];
    for (const kind of kinds) {
      const r = set[kind];
      if (!r) continue;
      if ((r.src || r.head && r.tail) && canMse(mimeOf(r))) return { size, kind, r, mse: true };
      if (r.full) return { size, kind, r, mse: false };
    }
  }
  return null;
}

// src/control-state.ts
var initialControlState = (patch = {}) => ({
  playing: false,
  muted: true,
  volume: 1,
  rate: 1,
  loop: false,
  controlsVisible: true,
  captions: false,
  quality: "auto",
  ...patch
});
function reduceControlState(state, action) {
  switch (action.type) {
    case "play":
      return { ...state, playing: true };
    case "pause":
      return { ...state, playing: false, controlsVisible: true };
    case "show-controls":
      return { ...state, controlsVisible: true };
    case "hide-controls":
      return state.playing ? { ...state, controlsVisible: false } : state;
    case "toggle-muted":
      return { ...state, muted: !state.muted };
    case "volume": {
      const volume = Math.min(1, Math.max(0, action.value));
      return { ...state, volume, muted: volume === 0 };
    }
    case "rate":
      return { ...state, rate: Math.min(2, Math.max(0.5, action.value)) };
    case "quality":
      return { ...state, quality: action.value };
    case "toggle-loop":
      return { ...state, loop: !state.loop };
    case "toggle-captions":
      return { ...state, captions: !state.captions };
  }
}

// src/icons.ts
var paths = {
  play: '<path d="M5.75 5.56a1 1 0 0 1 1.53-.85l3.88 2.44a1 1 0 0 1 0 1.7l-3.88 2.44a1 1 0 0 1-1.53-.85Z"/>',
  pause: '<path d="M5.25 3.25v9.5M10.75 3.25v9.5"/>',
  volume: '<path d="M2.75 6.25h2.5l3-2.5v8.5l-3-2.5h-2.5Z"/><path d="M10.5 6a3 3 0 0 1 0 4M12 4.5a5 5 0 0 1 0 7"/>',
  muted: '<path d="M2.75 6.25h2.5l3-2.5v8.5l-3-2.5h-2.5Z"/><path d="m10.5 6 3 4M13.5 6l-3 4"/>',
  loop: '<path d="M12.75 6.25V4.5a1.5 1.5 0 0 0-1.5-1.5h-6.5A1.5 1.5 0 0 0 3.25 4.5v.25M10.75 4.25l2 2 2-2M3.25 9.75v1.75A1.5 1.5 0 0 0 4.75 13h6.5a1.5 1.5 0 0 0 1.5-1.5v-.25M5.25 11.75l-2-2-2 2"/>',
  pip: '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2"/><rect x="7.75" y="7.25" width="4.5" height="3.5" rx=".75"/>',
  fullscreen: '<path d="M2.75 6V3.4q0-.65.65-.65H6M10 2.75h2.6q.65 0 .65.65V6M13.25 10v2.6q0 .65-.65.65H10M6 13.25H3.4q-.65 0-.65-.65V10"/>',
  download: '<path d="M2.75 11.75v.5q0 2 2 2h6.5q2 0 2-2v-.5M7.75 1.75v7.5M5 6.5l2.75 2.75L10.5 6.5"/>',
  cc: '<rect x="1.75" y="3.25" width="12.5" height="9.5" rx="2"/><path d="M7 6.25H5.75q-1.5 0-1.5 1.75t1.5 1.75H7M12 6.25h-1.25q-1.5 0-1.5 1.75t1.5 1.75H12"/>'
};
var icon = (name) => `<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

// src/cache.ts
var MAX = 120;
var heads = /* @__PURE__ */ new Map();
var queue = [];
var running = 0;
var keyOf = (url, end) => `${url}#0-${end ?? ""}`;
async function get(url, priority, start, end) {
  const ranged = start !== void 0 || end !== void 0;
  const headers = ranged ? { Range: `bytes=${start ?? 0}-${end ?? ""}` } : void 0;
  const response = await fetch(url, { priority, credentials: "omit", headers });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const data = await response.arrayBuffer();
  if (ranged && response.status === 200) return data.slice(start ?? 0, end === void 0 ? void 0 : end + 1);
  return data;
}
function run(task, speculative) {
  if (task.started) return;
  task.started = true;
  if (speculative) running++;
  get(task.url, task.priority, 0, task.end).then(task.resolve, task.reject).finally(() => {
    if (speculative) {
      running--;
      drain();
    }
  });
}
function drain() {
  const limit = prefetchLimit();
  while (running < limit && queue.length) {
    const task = queue.shift();
    if (!task.started && heads.get(task.key) === task) run(task, true);
  }
}
function head(url, end, priority = "high") {
  const key = keyOf(url, end);
  let task = heads.get(key);
  if (task) {
    heads.delete(key);
    heads.set(key, task);
    if (priority === "high" && !task.started) {
      task.priority = "high";
      const at = queue.indexOf(task);
      if (at >= 0) queue.splice(at, 1);
      run(task, false);
    }
    return task.promise;
  }
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  task = { key, url, end, priority, started: false, promise, resolve, reject };
  promise.catch(() => heads.get(key) === task && heads.delete(key));
  heads.set(key, task);
  if (heads.size > MAX) {
    const oldest = heads.keys().next().value;
    const evicted = heads.get(oldest);
    heads.delete(oldest);
    const at = evicted ? queue.indexOf(evicted) : -1;
    if (at >= 0) queue.splice(at, 1);
  }
  if (priority === "high") run(task, false);
  else {
    queue.push(task);
    drain();
  }
  return promise;
}
var tail = (url, start) => get(url, "high", start);
function prefetchHead(url, end) {
  if (prefetchLimit() < 1) return;
  head(url, end, "low").catch(() => {
  });
}

// src/registry.ts
var near = /* @__PURE__ */ new Set();
var byEl = /* @__PURE__ */ new Map();
var origins = /* @__PURE__ */ new Set();
var io;
var installed = false;
function preconnect(url) {
  try {
    const o = new URL(url, location.href).origin;
    if (o === location.origin || origins.has(o)) return;
    origins.add(o);
    const l = document.createElement("link");
    l.rel = "preconnect";
    l.href = o;
    l.crossOrigin = "anonymous";
    document.head.appendChild(l);
  } catch {
  }
}
function prefetchFor(it) {
  if (prefetchLimit() < 1 || !it.source) return;
  const pk = pick(it.source);
  if (pk?.mse) {
    const url = pk.r.src ?? pk.r.head;
    if (url) prefetchHead(url, pk.r.src ? pk.r.headBytes - 1 : void 0);
  }
}
var renditionUrl = (r) => r.src ?? r.head;
function register(it) {
  byEl.set(it.hitTarget, it);
  if (it.source) {
    probeCodecs(it.source);
    const pk = pick(it.source);
    const url = pk && renditionUrl(pk.r);
    if (url) preconnect(url);
  }
  io ?? (io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        const it2 = byEl.get(e.target);
        if (!it2) continue;
        if (e.isIntersecting) {
          near.add(it2);
          prefetchFor(it2);
        } else near.delete(it2);
      }
    },
    { rootMargin: "600px 0px" }
  ));
  io.observe(it.hitTarget);
  install();
}
function unregister(it) {
  near.delete(it);
  if (byEl.get(it.hitTarget) === it) byEl.delete(it.hitTarget);
  io?.unobserve(it.hitTarget);
}
var owner = (t) => {
  for (let n = t; n; n = n.parentNode) {
    const it = byEl.get(n);
    if (it) return it;
  }
};
var trail = [];
var raf = 0;
function project() {
  raf = 0;
  const now = trail[trail.length - 1];
  if (!config.predict || !now || prefetchLimit() < 1) return;
  const from = trail.find((s) => now.t - s.t >= 24 && now.t - s.t <= 140);
  if (!from) return;
  const dt = now.t - from.t;
  const vx = (now.x - from.x) / dt;
  const vy = (now.y - from.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed < 0.12) return;
  const len = Math.min(Math.max(speed * config.lookaheadMs, 48), 720);
  const dx = vx / speed * len;
  const dy = vy / speed * len;
  let best;
  let bestT = Infinity;
  const PAD = 10;
  for (const it of near) {
    if (!it.source) continue;
    const r = it.hitTarget.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) continue;
    if (now.x >= r.left && now.x <= r.right && now.y >= r.top && now.y <= r.bottom) continue;
    let t0 = 0;
    let t1 = 1;
    for (const [p, d, lo, hi] of [
      [now.x, dx, r.left - PAD, r.right + PAD],
      [now.y, dy, r.top - PAD, r.bottom + PAD]
    ]) {
      if (d === 0) {
        if (p < lo || p > hi) t1 = -1;
      } else {
        const a = (lo - p) / d;
        const b = (hi - p) / d;
        t0 = Math.max(t0, Math.min(a, b));
        t1 = Math.min(t1, Math.max(a, b));
      }
    }
    if (t0 <= t1 && t0 < bestT) {
      best = it;
      bestT = t0;
    }
  }
  best?.warm(true);
}
function onMove(e) {
  if (e.pointerType === "touch" || !config.predict) return;
  trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
  if (trail.length > 12) trail.shift();
  if (!raf) raf = requestAnimationFrame(project);
}
function install() {
  if (installed) return;
  installed = true;
  addEventListener("pointermove", onMove, { passive: true, capture: true });
  document.documentElement.addEventListener("pointerleave", () => trail = [], { passive: true });
  addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      if (t.matches?.(":focus-visible")) owner(t)?.warm(true);
    },
    { passive: true }
  );
  addEventListener("pointerdown", (e) => e.pointerType === "touch" && owner(e.target)?.warm(), { passive: true, capture: true });
}

// src/player.ts
var MEDIA_EVENTS = ["play", "pause", "timeupdate", "durationchange", "ended", "volumechange", "ratechange", "loadedmetadata", "progress"];
var Player = class extends EventTarget {
  constructor(host, pk) {
    super();
    __publicField(this, "host", host);
    __publicField(this, "pk", pk);
    __publicField(this, "current");
    __publicField(this, "ms");
    __publicField(this, "sb");
    __publicField(this, "url", "");
    __publicField(this, "q", []);
    __publicField(this, "tail", 0);
    __publicField(this, "headIn", false);
    __publicField(this, "playing", false);
    __publicField(this, "dead", false);
    __publicField(this, "started", false);
    __publicField(this, "onData");
    __publicField(this, "pendingSeek");
    __publicField(this, "switchToken", 0);
    __publicField(this, "quality", 360);
    this.current = this.makeVideo();
  }
  get video() {
    return this.current;
  }
  get currentTime() {
    return this.current.currentTime || 0;
  }
  get duration() {
    return Number.isFinite(this.current.duration) ? this.current.duration : this.pk.r.dur;
  }
  get paused() {
    return this.current.paused;
  }
  get currentQuality() {
    return this.quality;
  }
  makeVideo() {
    const v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.tabIndex = -1;
    v.disableRemotePlayback = true;
    v.setAttribute("aria-hidden", "true");
    for (const type of MEDIA_EVENTS) v.addEventListener(type, () => {
      if (v === this.current) this.dispatchEvent(new Event(type));
    });
    v.addEventListener("playing", () => {
      if (v !== this.current) return;
      this.dispatchEvent(new Event("playing"));
      this.host.host?.dispatchEvent(new Event("playing"));
    });
    v.addEventListener("error", () => {
      if (v !== this.current) return;
      if (this.ms) this.fallback("video error " + (v.error?.message ?? v.error?.code ?? ""));
      else this.dispatchEvent(new Event("error"));
    });
    v.addEventListener("loadedmetadata", () => this.applySeek());
    v.addEventListener("progress", () => this.applySeek());
    this.host.appendChild(v);
    return v;
  }
  /** Begin loading the preview head. A high-priority call promotes a queued speculative request. */
  start(priority = "high") {
    const previewUrl = this.pk.r.src ?? this.pk.r.head;
    const rangeEnd = this.pk.r.src ? this.pk.r.headBytes - 1 : void 0;
    if (this.started || this.dead) {
      if (this.started && priority === "high" && previewUrl) head(previewUrl, rangeEnd, "high").catch(() => {
      });
      return;
    }
    this.started = true;
    if (!this.pk.mse || !MS) return this.progressive();
    const ms = this.ms = new MS();
    this.url = URL.createObjectURL(ms);
    this.current.src = this.url;
    ms.addEventListener("sourceopen", () => {
      if (this.dead || this.ms !== ms) return;
      try {
        const sb = this.sb = ms.addSourceBuffer(mimeOf(this.pk.r));
        sb.addEventListener("updateend", () => this.pump());
        if (!previewUrl) throw new Error("preview rendition has no source");
        head(previewUrl, rangeEnd, priority).then((b) => {
          if (this.sb !== sb) return;
          this.q.unshift(b);
          this.headIn = true;
          this.pump();
        }).catch((e) => this.fallback("head " + e));
        this.fetchTail();
      } catch (e) {
        this.fallback("setup " + e);
      }
    }, { once: true });
  }
  pump() {
    const sb = this.sb;
    const ms = this.ms;
    if (!sb || !ms || !this.headIn || this.dead || sb.updating || ms.readyState !== "open") return;
    this.applySeek();
    const b = this.q.shift();
    if (b) {
      try {
        sb.appendBuffer(b);
      } catch (e) {
        this.fallback("append " + e);
      }
    } else if (this.tail === 3) {
      try {
        ms.endOfStream();
      } catch {
      }
    }
  }
  fetchTail() {
    if (this.tail !== 1 || !this.sb) return;
    this.tail = 2;
    const sb = this.sb;
    const url = this.pk.r.src ?? this.pk.r.tail;
    if (!url) return this.fallback("preview rendition has no tail");
    tail(url, this.pk.r.src ? this.pk.r.headBytes : void 0).then((b) => {
      if (this.dead || this.sb !== sb) return;
      this.tail = 3;
      this.q.push(b);
      this.pump();
    }).catch((e) => this.fallback("tail " + e));
  }
  progressive() {
    if (!this.pk.r.full) return;
    this.current.src = this.pk.r.full;
    this.current.load();
  }
  fallback(why = "") {
    if (this.dead || !this.pk.mse || !this.pk.r.full) return;
    console.debug("[instant-video] MSE failed, using progressive file:", why);
    const time = this.current.currentTime || 0;
    this.releaseMse();
    this.pk = { ...this.pk, mse: false };
    this.pendingSeek = time;
    this.progressive();
    if (this.playing) this.current.play().catch(() => {
    });
  }
  releaseMse() {
    this.q = [];
    this.sb = void 0;
    this.ms = void 0;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = "";
    this.headIn = false;
  }
  play() {
    if (this.dead) return;
    this.start();
    if (this.tail === 0) {
      this.tail = 1;
      this.fetchTail();
    }
    this.playing = true;
    this.showWhenReady();
    this.current.play().catch(() => {
    });
  }
  pause(rewind = false) {
    this.playing = false;
    this.current.pause();
    if (rewind && this.current.readyState >= 1) this.seek(0);
  }
  scrub(progress) {
    this.start();
    if (this.tail === 0) {
      this.tail = 1;
      this.fetchTail();
    }
    this.pause();
    this.pendingSeek = Math.min(1, Math.max(0, progress)) * Math.max(0, this.pk.r.dur - 1 / 60);
    this.showWhenReady();
    this.applySeek();
  }
  seek(time) {
    this.pendingSeek = Math.min(Math.max(0, time), Math.max(0, this.duration - 1 / 120));
    this.applySeek();
  }
  step(frames, fps = 25) {
    if (this.current.paused) this.seek(this.currentTime + frames / fps);
  }
  setMediaOptions(options) {
    const v = this.current;
    if (options.muted !== void 0) v.muted = options.muted;
    if (options.volume !== void 0) v.volume = options.volume;
    if (options.rate !== void 0) v.playbackRate = options.rate;
    if (options.loop !== void 0) v.loop = options.loop;
    if (options.poster !== void 0) v.poster = options.poster;
    if (options.title !== void 0) v.title = options.title;
  }
  showWhenReady() {
    const v = this.current;
    if (v.readyState >= 2) v.classList.add("on");
    else if (!this.onData) {
      this.onData = () => {
        this.onData = void 0;
        if (v === this.current) v.classList.add("on");
        this.applySeek();
      };
      v.addEventListener("loadeddata", this.onData, { once: true });
    }
  }
  applySeek() {
    if (this.pendingSeek === void 0 || this.current.readyState < 1) return;
    const t = this.pendingSeek;
    this.pendingSeek = void 0;
    try {
      if (Math.abs(this.current.currentTime - t) > 1 / 120) this.current.currentTime = t;
    } catch {
      this.pendingSeek = t;
    }
  }
  /** Prepare a new source behind the current frame and reveal it at the next aligned keyframe. */
  async switchSource(source, keyframe = 0.48) {
    if (this.dead || source.quality === this.quality) return;
    const token = ++this.switchToken;
    const old = this.current;
    const wasPlaying = !old.paused;
    const candidate = this.makeVideo();
    candidate.muted = old.muted;
    candidate.volume = old.volume;
    candidate.playbackRate = old.playbackRate;
    candidate.loop = old.loop;
    candidate.poster = old.poster;
    candidate.title = old.title;
    for (const track of Array.from(old.querySelectorAll("track"))) candidate.append(track.cloneNode(true));
    const load = (url) => new Promise((resolve, reject) => {
      const ready = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(candidate.error);
      };
      const cleanup = () => {
        candidate.removeEventListener("loadedmetadata", ready);
        candidate.removeEventListener("error", fail);
      };
      candidate.addEventListener("loadedmetadata", ready);
      candidate.addEventListener("error", fail);
      candidate.src = url;
      candidate.load();
    });
    try {
      await load(source.src);
    } catch {
      if (!source.fallback) {
        candidate.remove();
        throw new Error(`quality ${source.quality} failed`);
      }
      await load(source.fallback);
    }
    if (token !== this.switchToken || this.dead) return candidate.remove();
    const now = old.currentTime || 0;
    const at = wasPlaying ? Math.min(Math.ceil((now + 0.02) / keyframe) * keyframe, Math.max(0, candidate.duration - 0.05)) : Math.min(now, Math.max(0, candidate.duration - 0.05));
    await new Promise((resolve) => {
      const done = () => {
        candidate.removeEventListener("seeked", done);
        resolve();
      };
      candidate.addEventListener("seeked", done);
      candidate.currentTime = at;
      if (Math.abs(candidate.currentTime - at) < 1 / 120) done();
    });
    if (token !== this.switchToken || this.dead) return candidate.remove();
    if (wasPlaying) await new Promise((resolve) => {
      const wait = () => {
        if (token !== this.switchToken || this.dead || old.currentTime >= at - 0.025 || old.ended) resolve();
        else requestAnimationFrame(wait);
      };
      wait();
    });
    if (token !== this.switchToken || this.dead) return candidate.remove();
    this.current = candidate;
    this.quality = source.quality;
    candidate.classList.add("on");
    if (wasPlaying) await candidate.play().catch(() => {
    });
    old.classList.remove("on");
    old.pause();
    window.setTimeout(() => {
      old.removeAttribute("src");
      old.load();
      old.remove();
    }, 200);
    this.releaseMse();
  }
  stop() {
    this.switchToken++;
    if (this.onData) this.current.removeEventListener("loadeddata", this.onData);
    this.onData = void 0;
    this.pendingSeek = void 0;
    this.current.classList.remove("on");
    this.pause(true);
  }
  destroy() {
    this.dead = true;
    this.stop();
    this.releaseMse();
    this.current.removeAttribute("src");
    this.current.load();
    this.current.remove();
  }
};

// src/pool.ts
var warm = /* @__PURE__ */ new Set();
function touch(p) {
  warm.delete(p);
  warm.add(p);
  for (const old of warm) {
    if (warm.size <= config.poolSize) break;
    if (old === p || old.active) continue;
    warm.delete(old);
    old.cool();
  }
}
var drop = (p) => void warm.delete(p);

// src/element.ts
var CSS = `
:host{--iv-accent:#fff;--iv-fg:#fff;--iv-bg:rgba(10,10,11,.72);--iv-radius:14px;--iv-font:Geist,Inter,ui-sans-serif,system-ui,sans-serif;position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none;contain:strict;color:var(--iv-fg);font-family:var(--iv-font)}
:host([mode=player]){pointer-events:auto;contain:layout paint;background:#080808;border-radius:var(--iv-radius);outline:none;touch-action:pan-x}
*{box-sizing:border-box}video{position:absolute;z-index:0;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;pointer-events:none;transition:opacity 180ms cubic-bezier(.23,1,.32,1)}video.on{opacity:1}
.title{position:absolute;z-index:2;top:16px;left:18px;right:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:550;text-shadow:0 1px 10px #000;opacity:0;transition:opacity 140ms}.player.visible .title{opacity:1}
.player{display:none;position:absolute;z-index:3;inset:0}.player.on{display:block}.controls{position:absolute;left:10px;right:10px;bottom:10px;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:calc(var(--iv-radius) - 4px);background:var(--iv-bg);box-shadow:0 12px 36px rgba(0,0,0,.38);backdrop-filter:blur(18px) saturate(1.25);-webkit-backdrop-filter:blur(18px) saturate(1.25);opacity:0;transform:translateY(6px);transition:opacity 140ms,transform 180ms cubic-bezier(.23,1,.32,1)}.player.visible .controls{opacity:1;transform:none}
.timeline{position:relative;height:20px;display:flex;align-items:center}.track,.buffered{position:absolute;left:0;right:0;height:3px;border-radius:99px}.track{background:rgba(255,255,255,.2)}.buffered{right:auto;width:0;background:rgba(255,255,255,.42)}input[type=range]{appearance:none;-webkit-appearance:none;position:relative;width:100%;height:20px;margin:0;background:transparent;cursor:pointer}input[type=range]::-webkit-slider-runnable-track{height:3px;background:transparent}input[type=range]::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:11px;height:11px;margin-top:-4px;border:0;border-radius:50%;background:var(--iv-accent);box-shadow:0 0 0 2px rgba(0,0,0,.35)}input[type=range]::-moz-range-track{height:3px;background:transparent}input[type=range]::-moz-range-thumb{width:11px;height:11px;border:0;border-radius:50%;background:var(--iv-accent)}
.tip{display:none;position:absolute;left:0;bottom:27px;transform:translateX(-50%);padding:4px;border-radius:8px;background:#090909;box-shadow:0 6px 22px #000;font:500 11px/1 var(--iv-font);text-align:center;pointer-events:none}.timeline:hover .tip{display:block}.thumb{display:none;width:160px;height:90px;margin-bottom:5px;border-radius:5px;background-repeat:no-repeat;background-color:#111}.tip.has-thumb .thumb{display:block}.tip time{display:block;padding:2px 3px}
.row{display:flex;align-items:center;gap:3px;min-width:0}.spacer{flex:1}.time{margin:0 7px;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;color:rgba(255,255,255,.78)}button,a.dl{display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;text-decoration:none;cursor:pointer}button:hover,a.dl:hover{background:rgba(255,255,255,.1)}button[aria-pressed=true]{color:var(--iv-accent);background:rgba(255,255,255,.11)}button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--iv-accent);outline-offset:2px}.volume{width:66px!important}select{height:30px;max-width:82px;padding:0 7px;border:0;border-radius:7px;background:rgba(255,255,255,.08);color:inherit;font:500 11px var(--iv-font);cursor:pointer}.cc[hidden],.dl[hidden]{display:none}
@media(max-width:620px){.volume,.speed{display:none}.controls{left:6px;right:6px;bottom:6px}.time{margin-inline:4px}.row{gap:1px}button,a.dl{width:30px}}
@media(prefers-reduced-motion:reduce){video,.controls,.title{transition:none!important}}
`;
var formatTime = (value) => {
  const n = Number.isFinite(value) ? Math.max(0, value) : 0;
  const h = Math.floor(n / 3600);
  const m = Math.floor(n % 3600 / 60);
  const s = Math.floor(n % 60).toString().padStart(2, "0");
  return h ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
};
var Base = typeof HTMLElement !== "undefined" ? HTMLElement : class {
};
var InstantVideoElement = class extends Base {
  constructor() {
    super(...arguments);
    __publicField(this, "_src", null);
    __publicField(this, "_target", null);
    __publicField(this, "player");
    __publicField(this, "root");
    __publicField(this, "playerUi");
    __publicField(this, "controlsUi");
    __publicField(this, "on", false);
    __publicField(this, "boundTarget");
    __publicField(this, "state", initialControlState());
    __publicField(this, "hideTimer", 0);
    __publicField(this, "touchStart");
    __publicField(this, "lastTap");
    __publicField(this, "tapTimer", 0);
    __publicField(this, "trackObserver");
    __publicField(this, "onControlClick", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action || action === "download") return;
      if (action === "play") this.togglePlay();
      if (action === "mute" && this.player) {
        this.act({ type: "toggle-muted" });
        this.player.setMediaOptions({ muted: this.state.muted });
      }
      if (action === "loop" && this.player) {
        this.act({ type: "toggle-loop" });
        this.player.setMediaOptions({ loop: this.state.loop });
      }
      if (action === "captions") {
        this.act({ type: "toggle-captions" });
        this.applyCaptions();
      }
      if (action === "pip") this.player?.video.requestPictureInPicture?.().catch(() => {
      });
      if (action === "fullscreen") (document.fullscreenElement ? document.exitFullscreen() : this.requestFullscreen()).catch(() => {
      });
      this.showControls();
    });
    __publicField(this, "onSeek", (event) => {
      const input = event.currentTarget;
      this.player?.seek(Number(input.value) / 1e3 * (this.player.duration || 0));
      this.showControls();
    });
    __publicField(this, "onVolume", (event) => {
      this.act({ type: "volume", value: Number(event.currentTarget.value) });
      this.player?.setMediaOptions({ volume: this.state.volume, muted: this.state.muted });
    });
    __publicField(this, "onSpeed", (event) => {
      this.act({ type: "rate", value: Number(event.currentTarget.value) });
      this.player?.setMediaOptions({ rate: this.state.rate });
    });
    __publicField(this, "onQuality", (event) => {
      const raw = event.currentTarget.value;
      const value = raw === "auto" ? "auto" : Number(raw);
      this.act({ type: "quality", value });
      this.selectQuality(value);
    });
    __publicField(this, "onTimelineHover", (event) => {
      if (!this.playerUi || !this.player) return;
      const timeline = event.currentTarget;
      const rect = timeline.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const time = progress * this.player.duration;
      const tip = timeline.querySelector(".tip");
      tip.style.left = `${progress * 100}%`;
      tip.querySelector("time").textContent = formatTime(time);
      const sprite = this._src?.full?.sprite;
      if (sprite) {
        const frame = Math.min(sprite.count - 1, Math.floor(time / sprite.interval));
        const x = frame % sprite.columns;
        const y = Math.floor(frame / sprite.columns);
        const thumb = tip.querySelector(".thumb");
        thumb.style.backgroundImage = `url("${sprite.src.replace(/"/g, "%22")}")`;
        thumb.style.backgroundPosition = `${-x * sprite.width}px ${-y * sprite.height}px`;
        thumb.style.backgroundSize = `${sprite.columns * sprite.width}px ${sprite.rows * sprite.height}px`;
        tip.classList.add("has-thumb");
      }
    });
    __publicField(this, "onKeyDown", (event) => {
      if (this.mode !== "player" || event.target.matches("input,select,button,a")) return;
      const key = event.key.toLowerCase();
      if (key === " " || key === "k") this.togglePlay();
      else if (key === "j") this.seekBy(-10);
      else if (key === "l") this.seekBy(10);
      else if (key === "arrowleft") this.seekBy(-5);
      else if (key === "arrowright") this.seekBy(5);
      else if (key === "arrowup" || key === "arrowdown") {
        const volume = Math.min(1, Math.max(0, this.state.volume + (key === "arrowup" ? 0.1 : -0.1)));
        this.act({ type: "volume", value: volume });
        this.player?.setMediaOptions({ volume, muted: volume === 0 });
      } else if (key === "m" && this.player) {
        this.act({ type: "toggle-muted" });
        this.player.setMediaOptions({ muted: this.state.muted });
      } else if (key === "f") (document.fullscreenElement ? document.exitFullscreen() : this.requestFullscreen()).catch(() => {
      });
      else if (/^[0-9]$/.test(key)) this.player?.seek(Number(key) / 10 * this.player.duration);
      else if ((key === "," || key === ".") && this.player?.paused) this.player.step(key === "," ? -1 : 1, this._src?.fps);
      else return;
      event.preventDefault();
      this.showControls();
    });
    __publicField(this, "onActivity", () => this.mode === "player" && this.showControls());
    __publicField(this, "onTouchDown", (event) => {
      if (event.pointerType === "touch" && !event.target.closest(".controls")) this.touchStart = { x: event.clientX, y: event.clientY, at: performance.now() };
    });
    __publicField(this, "onTouchUp", (event) => {
      if (event.pointerType !== "touch" || !this.touchStart || event.target.closest(".controls")) return;
      const start = this.touchStart;
      this.touchStart = void 0;
      if (event.clientY - start.y > 60 && this.closest("[data-iv-sheet],dialog,[role=dialog]")) {
        this.dispatchEvent(new CustomEvent("iv-close", { bubbles: true, composed: true }));
        return;
      }
      const now = performance.now();
      if (this.lastTap && now - this.lastTap.at < 300 && Math.abs(event.clientX - this.lastTap.x) < 80) {
        clearTimeout(this.tapTimer);
        this.seekBy(event.clientX < this.getBoundingClientRect().left + this.clientWidth / 2 ? -10 : 10);
        this.lastTap = void 0;
      } else {
        this.lastTap = { x: event.clientX, at: now };
        this.tapTimer = window.setTimeout(() => {
          this.state.controlsVisible ? this.act({ type: "hide-controls" }) : this.showControls();
          this.lastTap = void 0;
        }, 300);
      }
    });
  }
  get source() {
    return this._src;
  }
  set source(source) {
    if (source === this._src) return;
    this._src = source;
    this.cool();
    if (this.isConnected) {
      unregister(this);
      register(this);
      this.sync();
    }
  }
  get target() {
    return this._target;
  }
  set target(target) {
    if (target === this._target) return;
    if (this.isConnected) unregister(this);
    this._target = target;
    if (this.isConnected) {
      register(this);
      this.bindTarget();
    }
  }
  get hitTarget() {
    return this._target ?? this.closest("[data-iv-target]") ?? this.parentElement ?? this;
  }
  get active() {
    return this.on;
  }
  set active(value) {
    this.toggleAttribute("active", value);
  }
  get warmed() {
    return this.hasAttribute("warm");
  }
  set warmed(value) {
    this.toggleAttribute("warm", value);
  }
  get mode() {
    return this.getAttribute("mode") === "player" ? "player" : "preview";
  }
  set mode(value) {
    value === "player" ? this.setAttribute("mode", "player") : this.removeAttribute("mode");
  }
  get controls() {
    return this.hasAttribute("controls");
  }
  set controls(value) {
    this.toggleAttribute("controls", value);
  }
  get startAt() {
    return Number(this.getAttribute("start-at") ?? 0) || 0;
  }
  set startAt(value) {
    value ? this.setAttribute("start-at", String(value)) : this.removeAttribute("start-at");
  }
  get autoPlay() {
    return this.hasAttribute("autoplay");
  }
  set autoPlay(value) {
    this.toggleAttribute("autoplay", value);
  }
  get muted() {
    return this.hasAttribute("muted");
  }
  set muted(value) {
    this.toggleAttribute("muted", value);
  }
  get loop() {
    return this.hasAttribute("loop");
  }
  set loop(value) {
    this.toggleAttribute("loop", value);
  }
  get poster() {
    return this.getAttribute("poster") ?? "";
  }
  set poster(value) {
    value ? this.setAttribute("poster", value) : this.removeAttribute("poster");
  }
  get download() {
    return this.hasAttribute("download");
  }
  set download(value) {
    this.toggleAttribute("download", value);
  }
  connectedCallback() {
    if (!this.root) this.build();
    register(this);
    this.bindTarget();
    this.trackObserver = new MutationObserver(() => this.syncTracks());
    this.trackObserver.observe(this, { childList: true, subtree: true, attributes: true });
    this.sync();
  }
  disconnectedCallback() {
    unregister(this);
    this.unbindTarget();
    this.trackObserver?.disconnect();
    clearTimeout(this.hideTimer);
    clearTimeout(this.tapTimer);
    drop(this);
    this.cool();
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isConnected) return;
    if (name === "mode" && oldValue !== newValue) {
      const mode = this.mode;
      this.dispatchEvent(new CustomEvent("modechange", { detail: { mode }, bubbles: true, composed: true }));
    }
    this.sync();
  }
  build() {
    this.root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.root.append(style);
    const ui = document.createElement("div");
    ui.className = "player";
    ui.innerHTML = `<div class="title"></div><div class="controls">
      <div class="timeline"><i class="track"></i><i class="buffered"></i><input data-role="seek" type="range" min="0" max="1000" value="0" aria-label="Seek"><div class="tip"><i class="thumb"></i><time>0:00</time></div></div>
      <div class="row"><button data-action="play" type="button" aria-label="Play">${icon("play")}</button><span class="time"><span data-time="current">0:00</span> / <span data-time="total">0:00</span></span>
      <button data-action="mute" type="button" aria-label="Mute">${icon("volume")}</button><input class="volume" data-role="volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
      <span class="spacer"></span><select class="speed" data-role="speed" aria-label="Playback speed"><option value="0.5">0.5\xD7</option><option value="0.75">0.75\xD7</option><option value="1" selected>1\xD7</option><option value="1.25">1.25\xD7</option><option value="1.5">1.5\xD7</option><option value="2">2\xD7</option></select>
      <select data-role="quality" aria-label="Quality"><option value="auto">Auto</option><option value="360">360p</option><option value="720">720p</option><option value="1080">1080p</option></select>
      <button class="cc" data-action="captions" type="button" aria-label="Toggle captions" hidden>${icon("cc")}</button><button data-action="loop" type="button" aria-label="Toggle loop">${icon("loop")}</button><button data-action="pip" type="button" aria-label="Picture in picture">${icon("pip")}</button><button data-action="fullscreen" type="button" aria-label="Fullscreen">${icon("fullscreen")}</button><a class="dl" data-action="download" aria-label="Download video" download hidden>${icon("download")}</a></div>
    </div>`;
    this.root.append(ui);
    this.playerUi = ui;
    this.controlsUi = ui.querySelector(".controls");
    ui.addEventListener("click", this.onControlClick);
    ui.querySelector("[data-role=seek]").addEventListener("input", this.onSeek);
    ui.querySelector("[data-role=volume]").addEventListener("input", this.onVolume);
    ui.querySelector("[data-role=speed]").addEventListener("change", this.onSpeed);
    ui.querySelector("[data-role=quality]").addEventListener("change", this.onQuality);
    const timeline = ui.querySelector(".timeline");
    timeline.addEventListener("pointermove", this.onTimelineHover);
    this.addEventListener("keydown", this.onKeyDown);
    this.addEventListener("pointermove", this.onActivity, { passive: true });
    this.addEventListener("pointerdown", this.onTouchDown, { passive: true });
    this.addEventListener("pointerup", this.onTouchUp, { passive: true });
  }
  sync() {
    const playerMode = this.mode === "player";
    this.playerUi?.classList.toggle("on", playerMode);
    this.playerUi?.classList.toggle("visible", playerMode && this.controls);
    this.setAttribute("aria-hidden", String(!playerMode));
    if (playerMode) {
      if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
      this.enterPlayer();
      return;
    }
    this.tabIndex = -1;
    const want = this.hasAttribute("active");
    if (want) this.playPreview();
    else if (this.on) this.pausePreview();
    if (!want && this.hasAttribute("warm")) this.warm();
  }
  bindTarget() {
    const target = this.hitTarget;
    if (target === this.boundTarget) return;
    this.unbindTarget();
    this.boundTarget = target;
  }
  unbindTarget() {
    this.boundTarget = void 0;
  }
  warm(speculative = false) {
    if (!this._src || config.poolSize < 1) return;
    const player = this.ensure();
    if (!player) return;
    player.start(speculative ? "low" : "high");
    touch(this);
  }
  ensure() {
    if (this.player) return this.player;
    if (!this._src) return;
    const selected = pick(this._src);
    if (!selected) return;
    const player = this.player = new Player(this.root, selected);
    for (const type of ["play", "pause", "timeupdate", "ended", "error"]) player.addEventListener(type, () => {
      if (type === "play") this.act({ type: "play" });
      if (type === "pause") this.act({ type: "pause" });
      if (type === "timeupdate") this.renderTime();
      this.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
    });
    player.addEventListener("progress", () => this.renderTime());
    this.syncTracks();
    return player;
  }
  playPreview() {
    const player = this.ensure();
    if (!player) return;
    this.on = true;
    player.setMediaOptions({ muted: true, loop: true });
    player.play();
    touch(this);
    if (config.prefetch) prefetchFor(this);
  }
  pausePreview() {
    this.on = false;
    this.player?.stop();
  }
  enterPlayer() {
    const player = this.ensure();
    if (!player) return;
    this.on = true;
    player.setMediaOptions({ muted: this.muted, loop: this.loop, poster: this.poster, title: this.title, volume: this.state.volume, rate: this.state.rate });
    this.state = { ...this.state, muted: this.muted, loop: this.loop };
    if (this.startAt > 0 && player.currentTime < 0.05) player.seek(this.startAt);
    this.syncTracks();
    this.renderQualityOptions();
    this.render();
    this.updateDownload();
    this.showControls();
    if (this.autoPlay || !player.paused || this.hasAttribute("active")) player.play();
    this.selectQuality(this.state.quality);
  }
  act(action) {
    this.state = reduceControlState(this.state, action);
    this.render();
  }
  render() {
    if (!this.playerUi || !this.player) return;
    const play = this.playerUi.querySelector("[data-action=play]");
    play.innerHTML = icon(this.state.playing ? "pause" : "play");
    play.ariaLabel = this.state.playing ? "Pause" : "Play";
    const mute = this.playerUi.querySelector("[data-action=mute]");
    mute.innerHTML = icon(this.state.muted || this.state.volume === 0 ? "muted" : "volume");
    mute.ariaLabel = this.state.muted ? "Unmute" : "Mute";
    this.playerUi.querySelector("[data-action=loop]").setAttribute("aria-pressed", String(this.state.loop));
    this.playerUi.querySelector("[data-action=captions]").setAttribute("aria-pressed", String(this.state.captions));
    this.playerUi.classList.toggle("visible", this.controls && this.state.controlsVisible);
    const title = this.playerUi.querySelector(".title");
    title.textContent = this.title;
    this.renderTime();
  }
  renderTime() {
    if (!this.playerUi || !this.player) return;
    const time = this.player.currentTime;
    const duration = this.player.duration || this._src?.dur || 0;
    this.playerUi.querySelector("[data-time=current]").textContent = formatTime(time);
    this.playerUi.querySelector("[data-time=total]").textContent = formatTime(duration);
    const seek = this.playerUi.querySelector("[data-role=seek]");
    seek.value = String(duration ? Math.round(time / duration * 1e3) : 0);
    const ranges = this.player.video.buffered;
    const buffered = ranges.length && duration ? ranges.end(ranges.length - 1) / duration * 100 : 0;
    this.playerUi.querySelector(".buffered").style.width = `${Math.min(100, buffered)}%`;
  }
  renderQualityOptions() {
    const select = this.playerUi?.querySelector("[data-role=quality]");
    if (!select) return;
    for (const option of Array.from(select.options)) {
      const q = Number(option.value);
      option.disabled = !!q && q !== 360 && !this._src?.full?.r[q];
    }
  }
  resolveQuality(requested) {
    if (requested === 360 || !this._src?.full) return { value: 360, source: this._src?.r.m?.avc?.full ? { src: this._src.r.m.avc.full, quality: 360 } : void 0 };
    const available = [720, 1080].filter((q) => this._src.full.r[q]);
    const target = requested === "auto" ? available.filter((q) => q <= Math.max(720, this.clientHeight * Math.min(devicePixelRatio || 1, 2))).at(-1) ?? available[0] : requested;
    if (!target) return { value: 360 };
    const set = this._src.full.r[target];
    if (!set) return { value: 360 };
    const order = ["av1", "avc"];
    for (const kind of order) {
      const rendition = set[kind];
      if (!rendition) continue;
      if (kind === "av1" && !this.player?.video.canPlayType(`video/mp4; codecs="${rendition.codec}"`)) continue;
      return { value: target, source: { src: rendition.src, fallback: rendition.fallback ?? set.avc?.fallback, quality: target } };
    }
    return { value: 360 };
  }
  async selectQuality(requested) {
    const player = this.player;
    if (!player) return;
    const { source, value } = this.resolveQuality(requested);
    if (!source || value === player.currentQuality) return;
    try {
      await player.switchSource(source, (this._src?.gop ?? 12) / (this._src?.fps ?? 25));
      this.updateDownload(source.fallback ?? source.src);
      this.dispatchEvent(new CustomEvent("qualitychange", { detail: { quality: value, requested }, bubbles: true, composed: true }));
    } catch (error) {
      this.dispatchEvent(new CustomEvent("error", { detail: { error }, bubbles: true, composed: true }));
    }
  }
  updateDownload(src) {
    const link = this.playerUi?.querySelector("[data-action=download]");
    if (!link) return;
    link.hidden = !this.download;
    link.href = src ?? this.player?.video.currentSrc ?? "";
  }
  syncTracks() {
    if (!this.player) return;
    this.player.video.querySelectorAll("track").forEach((node) => node.remove());
    for (const source of Array.from(this.querySelectorAll("track"))) this.player.video.append(source.cloneNode(true));
    const hasCaptions = this.player.video.textTracks.length > 0 || !!this.querySelector("track");
    const button = this.playerUi?.querySelector("[data-action=captions]");
    if (button) button.hidden = !hasCaptions;
    this.applyCaptions();
  }
  applyCaptions() {
    if (!this.player) return;
    for (const track of Array.from(this.player.video.textTracks)) track.mode = this.state.captions ? "showing" : "disabled";
  }
  togglePlay() {
    if (!this.player) return;
    if (this.player.paused) this.player.play();
    else this.player.pause();
  }
  seekBy(delta) {
    this.player?.seek((this.player.currentTime ?? 0) + delta);
  }
  showControls() {
    if (!this.controls) return;
    this.act({ type: "show-controls" });
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.act({ type: "hide-controls" }), 2e3);
  }
  cool() {
    this.on = false;
    this.player?.destroy();
    this.player = void 0;
    drop(this);
  }
};
__publicField(InstantVideoElement, "observedAttributes", ["active", "warm", "mode", "controls", "start-at", "autoplay", "muted", "loop", "poster", "title", "download"]);
if (typeof customElements !== "undefined" && !customElements.get("instant-video")) customElements.define("instant-video", InstantVideoElement);

export {
  config,
  configure,
  quality,
  pick,
  InstantVideoElement
};
//# sourceMappingURL=chunk-QYVL3OY6.js.map