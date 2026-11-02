// src/node/encode.ts
import { createHash } from "crypto";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { mkdir, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
var exec = promisify(execFile);
var RENDITIONS = { m: { h: 360, avc: 26, av1: 38 }, s: { h: 240, avc: 31, av1: 42 } };
var MAX_BOOST = { avc: 14, av1: 12 };
var STEPS_PER_HALVING = { avc: 6, av1: 8 };
var VERSION = 1;
function boxes(buf) {
  const out = [];
  for (let o = 0; o + 8 <= buf.length; ) {
    let size = buf.readUInt32BE(o);
    const type = buf.toString("latin1", o + 4, o + 8);
    if (size === 1) size = Number(buf.readBigUInt64BE(o + 8));
    if (size === 0) size = buf.length - o;
    out.push({ type, start: o, end: o + size });
    o += size;
  }
  return out;
}
function codecString(init) {
  const a = init.indexOf("avcC");
  if (a >= 0) return "avc1." + [1, 2, 3].map((i) => init[a + 4 + i].toString(16).padStart(2, "0")).join("").toUpperCase();
  const v = init.indexOf("av1C");
  if (v >= 0) {
    const b1 = init[v + 4 + 1];
    const b2 = init[v + 4 + 2];
    const profile = b1 >> 5;
    const level = b1 & 31;
    const tier = b2 >> 7 & 1;
    const hbd = b2 >> 6 & 1;
    return `av01.${profile}.${String(level).padStart(2, "0")}${tier ? "H" : "M"}.${hbd ? "10" : "08"}`;
  }
  throw new Error("unknown codec in init segment");
}
function splitFragments(buf) {
  const top = boxes(buf);
  const moov = top.find((b) => b.type === "moov");
  if (!moov) throw new Error("no moov box: not a fragmented MP4");
  const init = buf.subarray(0, moov.end);
  const frags = [];
  for (const m of top.filter((b) => b.type === "moof")) {
    const mdat = top[top.indexOf(m) + 1];
    frags.push(buf.subarray(m.start, mdat.end));
  }
  return { init, frags };
}
var hash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);
var round3 = (n) => Math.round(n * 1e3) / 1e3;
var TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
async function encodeClip(input, opts = {}) {
  const dur = opts.duration ?? 7;
  const fps = opts.fps ?? 25;
  const gop = opts.gop ?? 12;
  const headS = opts.head ?? 0.9;
  const budget = Math.max(0, opts.headKb ?? 40) * 1024;
  const ffmpeg = opts.ffmpeg ?? process.env.FFMPEG ?? "ffmpeg";
  const ffprobe = opts.ffprobe ?? process.env.FFPROBE ?? "ffprobe";
  const cwebp = opts.cwebp ?? process.env.CWEBP ?? "cwebp";
  if (!existsSync(input)) throw new Error(`input not found: ${input}`);
  const run = async (bin, args) => (await exec(bin, args, { encoding: "buffer", maxBuffer: 1 << 28 })).stdout;
  const work = opts.workDir ?? await mkdtemp(join(tmpdir(), "instant-video-"));
  await mkdir(work, { recursive: true });
  const vf = (h) => `scale=-2:${h}:flags=lanczos:out_color_matrix=bt709:out_range=tv,fps=${fps}`;
  const codecs = {
    avc: (crf, boost, headFrames) => [
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      String(crf),
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "main",
      "-level",
      "3.1",
      "-x264-params",
      `keyint=${gop}:min-keyint=${gop}:scenecut=0:bframes=0:open-gop=0${boost ? `:zones=0,${headFrames - 1},crf=${crf + boost}` : ""}`,
      ...TAGS
    ],
    av1: (crf, boost) => [
      "-c:v",
      "libsvtav1",
      "-crf",
      String(crf + boost),
      "-preset",
      "6",
      "-pix_fmt",
      "yuv420p",
      "-svtav1-params",
      `keyint=${gop}:irefresh-type=2:scd=0:lookahead=0`,
      "-g",
      String(gop),
      ...TAGS
    ]
  };
  try {
    const luma = async (t) => {
      try {
        return (await run(ffmpeg, ["-v", "error", "-ss", String(t), "-i", input, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]))[0];
      } catch {
        return 255;
      }
    };
    const ss0 = opts.start ?? 0;
    let ss = ss0;
    if (opts.skipBlack !== false) {
      while (await luma(ss) < 14 && ss < ss0 + 4) ss = round3(ss + 0.25);
      if (await luma(ss) < 14) ss = ss0;
    }
    const r = {};
    const fragDur = gop / fps;
    const nHeadWanted = Math.max(1, Math.ceil(headS / fragDur - 1e-6));
    const encodeVariant = async (rk, ck, boost) => {
      const R = RENDITIONS[rk];
      const f = join(work, `${rk}-${ck}.mp4`);
      await run(ffmpeg, [
        "-y",
        "-v",
        "error",
        "-ss",
        String(ss),
        "-i",
        input,
        "-t",
        String(dur),
        "-vf",
        vf(R.h),
        ...codecs[ck](R[ck], boost, nHeadWanted * gop),
        "-movflags",
        "cmaf+default_base_moof",
        "-an",
        f
      ]);
      const { init, frags } = splitFragments(await readFile(f));
      const frames = Number((await run(ffprobe, ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", f])).toString().trim());
      const nHead = Math.min(frags.length, nHeadWanted);
      const head = Buffer.concat([init, ...frags.slice(0, nHead)]);
      const tail = Buffer.concat(frags.slice(nHead));
      return { file: f, boost, codec: codecString(init), headDur: round3(nHead * fragDur), dur: round3(frames / fps), headBytes: head.length, tailBytes: tail.length, head: "", tail: "", _head: head, _tail: tail };
    };
    let posterFrom = "";
    for (const rk of Object.keys(RENDITIONS)) {
      r[rk] = {};
      for (const ck of ["avc", "av1"]) {
        let e = await encodeVariant(rk, ck, 0);
        for (let boost = 0; budget && e.headBytes > budget && boost < MAX_BOOST[ck]; ) {
          boost = Math.min(MAX_BOOST[ck], boost + Math.max(2, Math.ceil(STEPS_PER_HALVING[ck] * Math.log2(e.headBytes / budget)) + 1));
          e = await encodeVariant(rk, ck, boost);
        }
        if (ck === "avc") {
          const full = join(work, `${rk}-avc.full.mp4`);
          await run(ffmpeg, ["-y", "-v", "error", "-i", e.file, "-c", "copy", "-movflags", "+faststart", full]);
          e._full = await readFile(full);
          e.fullBytes = e._full.length;
          if (rk === "m") posterFrom = e.file;
        }
        r[rk][ck] = e;
      }
    }
    const png = join(work, "p0.png");
    await run(ffmpeg, ["-y", "-v", "error", "-i", posterFrom, "-frames:v", "1", png]);
    const jpg = join(work, "p0.jpg");
    const webp = join(work, "p0.webp");
    const avif = join(work, "p0.avif");
    await run(ffmpeg, ["-y", "-v", "error", "-i", png, "-q:v", "3", jpg]);
    try {
      await run(cwebp, ["-quiet", "-q", "78", png, "-o", webp]);
    } catch {
      await run(ffmpeg, ["-y", "-v", "error", "-i", png, "-c:v", "libwebp", "-quality", "78", webp]);
    }
    await run(ffmpeg, ["-y", "-v", "error", "-i", png, "-frames:v", "1", "-c:v", "libsvtav1", "-crf", "30", "-pix_fmt", "yuv420p", avif]);
    const [w, h] = (await run(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", posterFrom])).toString().trim().split(",").map(Number);
    const poster = { jpg: await readFile(jpg), webp: await readFile(webp), avif: await readFile(avif) };
    const artifacts = [];
    const names = /* @__PURE__ */ new Map();
    const add = (name, data, type) => {
      artifacts.push({ name, data, type });
      names.set(data, name);
      return name;
    };
    const sizes = { poster: {}, r: {} };
    const posterNames = {};
    for (const [k, buf] of Object.entries(poster)) {
      sizes.poster[k] = buf.length;
      posterNames[k] = add(`p-${hash(buf)}.${k}`, buf, `image/${k === "jpg" ? "jpeg" : k}`);
    }
    const files = {};
    for (const [rk, cs] of Object.entries(r)) {
      files[rk] = {};
      sizes.r[rk] = {};
      for (const [ck, e] of Object.entries(cs)) {
        files[rk][ck] = {
          head: add(`${rk}-${ck}-${hash(e._head)}.head.mp4`, e._head, "video/mp4"),
          tail: add(`${rk}-${ck}-${hash(e._tail)}.tail.m4s`, e._tail, "video/mp4"),
          ...e._full ? { full: add(`${rk}-${ck}-${hash(e._full)}.full.mp4`, e._full, "video/mp4") } : {}
        };
        sizes.r[rk][ck] = { head: e.headBytes, tail: e.tailBytes, full: e.fullBytes ?? null, codec: e.codec, boost: e.boost };
      }
    }
    return {
      w,
      h,
      start: ss,
      startShifted: ss !== ss0,
      artifacts,
      sizes,
      manifest(urls) {
        const url = (n) => {
          if (!(n in urls)) throw new Error(`no URL for ${n}`);
          return urls[n];
        };
        const out = { v: VERSION, dur, fps, gop, w, h, r: {}, poster: {} };
        for (const [k, n] of Object.entries(posterNames)) out.poster[k] = url(n);
        for (const [rk, cs] of Object.entries(r)) {
          const rr = {};
          for (const [ck, e] of Object.entries(cs)) {
            const f = files[rk][ck];
            rr[ck] = {
              codec: e.codec,
              headDur: e.headDur,
              dur: e.dur,
              headBytes: e.headBytes,
              tailBytes: e.tailBytes,
              head: url(f.head),
              tail: url(f.tail),
              ...f.full ? { full: url(f.full), fullBytes: e.fullBytes } : {}
            };
          }
          out.r[rk] = rr;
        }
        return out;
      }
    };
  } finally {
    if (!opts.workDir) await rm(work, { recursive: true, force: true });
  }
}
async function encodeToStorage(input, id, storage, opts = {}) {
  const clip = await encodeClip(input, opts);
  const urls = {};
  for (const a of clip.artifacts) urls[a.name] = await storage.put(`${id}/${a.name}`, a.data, a.type);
  return { clip, iv: clip.manifest(urls) };
}

export {
  boxes,
  codecString,
  splitFragments,
  encodeClip,
  encodeToStorage
};
//# sourceMappingURL=chunk-DNYWX4V7.js.map