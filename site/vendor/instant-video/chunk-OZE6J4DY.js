var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/config.ts
var config = {
  predict: true,
  prefetch: true,
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
      if (canMse(mimeOf(r))) return { size, kind, r, mse: true };
      if (r.full) return { size, kind, r, mse: false };
    }
  }
  return null;
}

// src/cache.ts
var MAX = 120;
var heads = /* @__PURE__ */ new Map();
async function get(url, priority) {
  const r = await fetch(url, { priority, credentials: "omit" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.arrayBuffer();
}
function head(url, priority = "high") {
  let p = heads.get(url);
  if (p) {
    heads.delete(url);
    heads.set(url, p);
    return p;
  }
  p = get(url, priority);
  p.catch(() => heads.get(url) === p && heads.delete(url));
  heads.set(url, p);
  if (heads.size > MAX) heads.delete(heads.keys().next().value);
  return p;
}
var tail = (url) => get(url, "high");
var running = 0;
var queue = [];
var LIMIT = 3;
function prefetchHead(url) {
  if (heads.has(url) || queue.includes(url)) return;
  queue.push(url);
  drain();
}
var idle = (cb) => typeof requestIdleCallback === "function" ? requestIdleCallback(cb, { timeout: 1500 }) : void setTimeout(cb, 120);
function drain() {
  while (running < LIMIT && queue.length) {
    const url = queue.shift();
    if (heads.has(url)) continue;
    running++;
    idle(() => {
      head(url, "low").catch(() => {
      }).finally(() => {
        running--;
        drain();
      });
    });
  }
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
  if (!config.prefetch || !it.source) return;
  const pk = pick(it.source);
  if (pk?.mse) prefetchHead(pk.r.head);
}
function register(it) {
  byEl.set(it.hitTarget, it);
  if (it.source) {
    probeCodecs(it.source);
    const pk = pick(it.source);
    if (pk) preconnect(pk.r.head);
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
  if (!config.predict || !now) return;
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
  best?.warm();
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
      if (t.matches?.(":focus-visible")) owner(t)?.warm();
    },
    { passive: true }
  );
  addEventListener("pointerdown", (e) => e.pointerType === "touch" && owner(e.target)?.warm(), { passive: true, capture: true });
}

// src/player.ts
var Player = class {
  constructor(host, pk) {
    __publicField(this, "pk", pk);
    __publicField(this, "video");
    __publicField(this, "ms");
    __publicField(this, "sb");
    __publicField(this, "url", "");
    __publicField(this, "q", []);
    __publicField(this, "tail", 0);
    // not wanted, wanted, fetching, queued
    __publicField(this, "headIn", false);
    // init+head must be the first thing appended, whatever arrives first
    __publicField(this, "playing", false);
    __publicField(this, "dead", false);
    __publicField(this, "started", false);
    __publicField(this, "onData");
    __publicField(this, "pendingSeek");
    const v = this.video = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.tabIndex = -1;
    v.disablePictureInPicture = true;
    v.disableRemotePlayback = true;
    v.setAttribute("aria-hidden", "true");
    v.addEventListener("error", () => this.fallback("video error " + (v.error?.code ?? "") + " " + (v.error?.message ?? "")));
    v.addEventListener("playing", () => host.host?.dispatchEvent(new Event("playing")));
    v.addEventListener("loadedmetadata", () => this.applySeek());
    v.addEventListener("progress", () => this.applySeek());
    host.appendChild(v);
  }
  /** Begin loading: attach the MediaSource and append init+head. Idempotent. */
  start() {
    if (this.started || this.dead) return;
    this.started = true;
    if (!this.pk.mse || !MS) return this.progressive();
    const ms = this.ms = new MS();
    this.url = URL.createObjectURL(ms);
    this.video.src = this.url;
    ms.addEventListener(
      "sourceopen",
      () => {
        if (this.dead || this.ms !== ms) return;
        try {
          const sb = this.sb = ms.addSourceBuffer(mimeOf(this.pk.r));
          sb.addEventListener("updateend", () => this.pump());
          head(this.pk.r.head).then((b) => {
            if (this.sb !== sb) return;
            this.q.unshift(b);
            this.headIn = true;
            this.pump();
          }).catch((e) => this.fallback("head " + e));
          this.fetchTail();
        } catch (e) {
          this.fallback("setup " + e);
        }
      },
      { once: true }
    );
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
    tail(this.pk.r.tail).then((b) => {
      if (this.dead || this.sb !== sb) return;
      this.tail = 3;
      this.q.push(b);
      this.pump();
    }).catch((e) => this.fallback("tail " + e));
  }
  progressive() {
    const full = this.pk.r.full;
    if (!full) return;
    this.video.src = full;
    this.video.load();
  }
  /** MSE failed: drop to the progressive file once. */
  fallback(why = "") {
    if (this.dead || !this.pk.mse || !this.pk.r.full) return;
    console.debug("[instant-video] MSE failed, using progressive file:", why);
    this.q = [];
    this.sb = void 0;
    this.ms = void 0;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = "";
    this.headIn = false;
    this.pk = { ...this.pk, mse: false };
    this.progressive();
    if (this.playing) this.video.play().catch(() => {
    });
  }
  /** Show the video (instantly when frame 0 is already decoded) and play. */
  play() {
    if (this.dead) return;
    this.start();
    if (this.tail === 0) {
      this.tail = 1;
      this.fetchTail();
    }
    this.playing = true;
    const v = this.video;
    if (v.readyState >= 2) v.classList.add("on");
    else {
      this.onData = () => v.classList.add("on");
      v.addEventListener("loadeddata", this.onData, { once: true });
    }
    v.play().catch(() => {
    });
  }
  /** Show a paused frame at `progress` (0–1). The tail is fetched on the first scrub. */
  scrub(progress) {
    if (this.dead) return;
    this.start();
    if (this.tail === 0) {
      this.tail = 1;
      this.fetchTail();
    }
    this.playing = false;
    this.video.pause();
    this.pendingSeek = Math.min(1, Math.max(0, progress)) * Math.max(0, this.pk.r.dur - 1 / 60);
    this.showWhenReady();
    this.applySeek();
  }
  showWhenReady() {
    const v = this.video;
    if (v.readyState >= 2) v.classList.add("on");
    else if (!this.onData) {
      this.onData = () => {
        this.onData = void 0;
        v.classList.add("on");
        this.applySeek();
      };
      v.addEventListener("loadeddata", this.onData, { once: true });
    }
  }
  applySeek() {
    if (this.pendingSeek === void 0 || this.video.readyState < 1) return;
    const t = this.pendingSeek;
    try {
      if (Math.abs(this.video.currentTime - t) > 1 / 120) this.video.currentTime = t;
    } catch {
      return;
    }
  }
  stop() {
    this.playing = false;
    const v = this.video;
    if (this.onData) v.removeEventListener("loadeddata", this.onData);
    this.onData = void 0;
    this.pendingSeek = void 0;
    v.classList.remove("on");
    v.pause();
    if (v.readyState >= 1 && v.currentTime > 0) v.currentTime = 0;
  }
  destroy() {
    this.dead = true;
    this.stop();
    this.q = [];
    this.sb = void 0;
    this.ms = void 0;
    if (this.url) URL.revokeObjectURL(this.url);
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
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
:host{position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none;contain:strict}
video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;pointer-events:none;transition:opacity 180ms var(--ease-out,cubic-bezier(.23,1,.32,1))}
video.on{opacity:1;transition:none}
`;
var Base = typeof HTMLElement !== "undefined" ? HTMLElement : class {
};
var InstantVideoElement = class extends Base {
  constructor() {
    super(...arguments);
    __publicField(this, "_src", null);
    __publicField(this, "_target", null);
    __publicField(this, "player");
    __publicField(this, "root");
    __publicField(this, "on", false);
    __publicField(this, "scrubRaf", 0);
    __publicField(this, "scrubProgress", 0);
    __publicField(this, "boundTarget");
    __publicField(this, "onPointerMove", (event) => {
      if (!this.on || this.mode !== "scrub") return;
      const e = event;
      if (e.pointerType === "touch") return;
      const r = this.hitTarget.getBoundingClientRect();
      if (!r.width) return;
      this.scrubProgress = (e.clientX - r.left) / r.width;
      if (!this.scrubRaf) this.scrubRaf = requestAnimationFrame(() => {
        this.scrubRaf = 0;
        this.player?.scrub(this.scrubProgress);
      });
    });
  }
  get source() {
    return this._src;
  }
  set source(s) {
    if (s === this._src) return;
    this._src = s;
    this.cool();
    if (this.isConnected) {
      unregister(this);
      register(this);
    }
  }
  get target() {
    return this._target;
  }
  set target(t) {
    if (t === this._target) return;
    if (this.isConnected) unregister(this);
    this._target = t;
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
  set active(v) {
    v ? this.setAttribute("active", "") : this.removeAttribute("active");
  }
  get warmed() {
    return this.hasAttribute("warm");
  }
  set warmed(v) {
    v ? this.setAttribute("warm", "") : this.removeAttribute("warm");
  }
  /** `play` loops normally; `scrub` maps horizontal pointer position to the clip timeline. */
  get mode() {
    return this.getAttribute("mode") === "scrub" ? "scrub" : "play";
  }
  set mode(v) {
    v === "scrub" ? this.setAttribute("mode", "scrub") : this.removeAttribute("mode");
  }
  connectedCallback() {
    if (!this.root) {
      this.root = this.attachShadow({ mode: "open" });
      const s = document.createElement("style");
      s.textContent = CSS;
      this.root.appendChild(s);
      this.setAttribute("aria-hidden", "true");
    }
    register(this);
    this.bindTarget();
    this.sync();
  }
  disconnectedCallback() {
    unregister(this);
    this.unbindTarget();
    drop(this);
    this.cool();
  }
  attributeChangedCallback() {
    if (this.isConnected) this.sync();
  }
  sync() {
    const want = this.hasAttribute("active");
    if (want) this.play();
    else if (this.on) this.pause();
    if (!want && this.hasAttribute("warm")) this.warm();
  }
  bindTarget() {
    const target = this.hitTarget;
    if (target === this.boundTarget) return;
    this.unbindTarget();
    this.boundTarget = target;
    target.addEventListener("pointermove", this.onPointerMove, { passive: true });
  }
  unbindTarget() {
    this.boundTarget?.removeEventListener("pointermove", this.onPointerMove);
    this.boundTarget = void 0;
    if (this.scrubRaf) cancelAnimationFrame(this.scrubRaf);
    this.scrubRaf = 0;
  }
  /** Get a decoded frame 0 ready without playing (idempotent; counts against the pool). */
  warm() {
    if (!this._src || config.poolSize < 1) return;
    const p = this.ensure();
    if (!p) return;
    p.start();
    touch(this);
  }
  ensure() {
    if (this.player) return this.player;
    if (!this._src) return;
    const pk = pick(this._src);
    if (!pk) return;
    return this.player = new Player(this.root, pk);
  }
  play() {
    const p = this.ensure();
    if (!p) return;
    this.on = true;
    if (this.mode === "scrub") p.scrub(this.scrubProgress);
    else p.play();
    touch(this);
    if (config.prefetch) prefetchFor(this);
  }
  pause() {
    this.on = false;
    this.player?.stop();
  }
  /** Release the player (MediaSource, decoder). */
  cool() {
    this.on = false;
    this.player?.destroy();
    this.player = void 0;
    drop(this);
  }
};
__publicField(InstantVideoElement, "observedAttributes", ["active", "warm", "mode"]);
if (typeof customElements !== "undefined" && !customElements.get("instant-video")) customElements.define("instant-video", InstantVideoElement);

export {
  config,
  configure,
  quality,
  pick,
  InstantVideoElement
};
//# sourceMappingURL=chunk-OZE6J4DY.js.map