import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "video";
const FINAL_PREFIX = "final/";
const SIGNED_TTL_SEC = 3600;

function dv(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}
function r32(b: Uint8Array, o: number): number { return dv(b).getUint32(o, false); }
function ri32(b: Uint8Array, o: number): number { return dv(b).getInt32(o, false); }
function r64(b: Uint8Array, o: number): bigint { return dv(b).getBigUint64(o, false); }
function w32(v: number): Uint8Array {
  const out = new Uint8Array(4);
  dv(out).setUint32(0, v >>> 0, false);
  return out;
}
function w64(v: bigint): Uint8Array {
  const out = new Uint8Array(8);
  dv(out).setBigUint64(0, v, false);
  return out;
}
function wi32(v: number): Uint8Array {
  const out = new Uint8Array(4);
  dv(out).setInt32(0, v | 0, false);
  return out;
}
function asc(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}
function cat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

type Box = { type: string; offset: number; size: number; payloadOffset: number; payloadSize: number };
function* iterBoxes(buf: Uint8Array, start: number, end: number): Iterable<Box> {
  let p = start;
  while (p + 8 <= end) {
    let size = r32(buf, p);
    const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    let payloadOffset = p + 8;
    let payloadSize: number;
    if (size === 1) {
      size = Number(r64(buf, p + 8));
      payloadSize = size - 16;
      payloadOffset = p + 16;
    } else if (size === 0) {
      payloadSize = end - payloadOffset;
      size = end - p;
    } else {
      payloadSize = size - 8;
    }
    yield { type, offset: p, size, payloadOffset, payloadSize };
    if (size <= 0) break;
    p += size;
  }
}
function findBox(buf: Uint8Array, start: number, end: number, type: string): Box | null {
  for (const b of iterBoxes(buf, start, end)) if (b.type === type) return b;
  return null;
}
function rawBox(buf: Uint8Array, box: Box): Uint8Array {
  return buf.subarray(box.offset, box.offset + box.size);
}
function mkBox(type: string, payload: Uint8Array): Uint8Array {
  if (payload.length + 8 <= 0xffffffff) {
    return cat([w32(payload.length + 8), asc(type), payload]);
  }
  return cat([w32(1), asc(type), w64(BigInt(payload.length + 16)), payload]);
}
function mkFullBox(type: string, version: number, flags: number, payload: Uint8Array): Uint8Array {
  const head = new Uint8Array(4);
  head[0] = version;
  head[1] = (flags >>> 16) & 0xff;
  head[2] = (flags >>> 8) & 0xff;
  head[3] = flags & 0xff;
  return mkBox(type, cat([head, payload]));
}
function fullHeader(buf: Uint8Array, off: number): { version: number; flags: number; payloadStart: number } {
  const version = buf[off];
  const flags = (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
  return { version, flags, payloadStart: off + 4 };
}

interface Stbl {
  stsdRaw: Uint8Array;
  stts: { count: number; delta: number }[];
  ctts: { count: number; offset: number }[] | null;
  stsc: { firstChunk: number; samplesPerChunk: number; sampleDescIndex: number }[];
  stsz: { defaultSize: number; sizes: number[] };
  chunkOffsets: number[];
  isCo64: boolean;
  stss: number[] | null;
  chunkCount: number;
  sampleCount: number;
}
interface Track {
  handlerType: string;
  tkhdRaw: Uint8Array;
  tkhdVersion: number;
  mdhdRaw: Uint8Array;
  mdhdVersion: number;
  mdhdTimescale: number;
  mdhdDuration: number;
  hdlrRaw: Uint8Array;
  vmhdRaw: Uint8Array | null;
  smhdRaw: Uint8Array | null;
  dinfRaw: Uint8Array | null;
  stbl: Stbl;
}
interface Clip {
  buf: Uint8Array;
  ftypRaw: Uint8Array;
  mdatDataStart: number;
  mdatDataEnd: number;
  mvhdRaw: Uint8Array;
  mvhdVersion: number;
  mvhdTimescale: number;
  mvhdDuration: number;
  tracks: Track[];
}

function parseSttsEntries(buf: Uint8Array, payloadStart: number): { count: number; delta: number }[] {
  const entryCount = r32(buf, payloadStart);
  const out: { count: number; delta: number }[] = [];
  let p = payloadStart + 4;
  for (let i = 0; i < entryCount; i++) {
    out.push({ count: r32(buf, p), delta: ri32(buf, p + 4) });
    p += 8;
  }
  return out;
}
function parseCttsEntries(buf: Uint8Array, payloadStart: number): { count: number; offset: number }[] {
  const entryCount = r32(buf, payloadStart);
  const out: { count: number; offset: number }[] = [];
  let p = payloadStart + 4;
  for (let i = 0; i < entryCount; i++) {
    out.push({ count: r32(buf, p), offset: ri32(buf, p + 4) });
    p += 8;
  }
  return out;
}
function parseStscEntries(buf: Uint8Array, payloadStart: number): { firstChunk: number; samplesPerChunk: number; sampleDescIndex: number }[] {
  const entryCount = r32(buf, payloadStart);
  const out: { firstChunk: number; samplesPerChunk: number; sampleDescIndex: number }[] = [];
  let p = payloadStart + 4;
  for (let i = 0; i < entryCount; i++) {
    out.push({ firstChunk: r32(buf, p), samplesPerChunk: r32(buf, p + 4), sampleDescIndex: r32(buf, p + 8) });
    p += 12;
  }
  return out;
}
function parseStsz(buf: Uint8Array, payloadStart: number): { defaultSize: number; sizes: number[] } {
  const defaultSize = r32(buf, payloadStart);
  const sampleCount = r32(buf, payloadStart + 4);
  const sizes: number[] = [];
  let p = payloadStart + 8;
  for (let i = 0; i < sampleCount; i++) {
    sizes.push(defaultSize !== 0 ? defaultSize : r32(buf, p));
    if (defaultSize === 0) p += 4;
  }
  return { defaultSize, sizes };
}
function parseStco(buf: Uint8Array, payloadStart: number): number[] {
  const entryCount = r32(buf, payloadStart);
  const out: number[] = [];
  let p = payloadStart + 4;
  for (let i = 0; i < entryCount; i++) {
    out.push(r32(buf, p));
    p += 4;
  }
  return out;
}
function parseCo64(buf: Uint8Array, payloadStart: number): bigint[] {
  const entryCount = r32(buf, payloadStart);
  const out: bigint[] = [];
  let p = payloadStart + 4;
  for (let i = 0; i < entryCount; i++) {
    out.push(r64(buf, p));
    p += 8;
  }
  return out;
}
function parseStss(buf: Uint8Array, payloadStart: number): number[] {
  const entryCount = r32(buf, payloadStart);
  const out: number[] = [];
  let p = payloadStart + 4;
  for (let i = 0; i < entryCount; i++) {
    out.push(r32(buf, p));
    p += 4;
  }
  return out;
}

function parseTrak(buf: Uint8Array, trakBox: Box): Track | null {
  const ts = trakBox.payloadOffset;
  const te = trakBox.offset + trakBox.size;

  const tkhdBox = findBox(buf, ts, te, "tkhd");
  if (!tkhdBox) return null;
  const tkhdRaw = rawBox(buf, tkhdBox);
  const tkhdHd = fullHeader(buf, tkhdBox.payloadOffset);
  const tkhdVersion = tkhdHd.version;

  const mdiaBox = findBox(buf, ts, te, "mdia");
  if (!mdiaBox) return null;
  const mp = mdiaBox.payloadOffset;
  const me = mdiaBox.offset + mdiaBox.size;

  const mdhdBox = findBox(buf, mp, me, "mdhd");
  if (!mdhdBox) return null;
  const mdhdRaw = rawBox(buf, mdhdBox);
  const mdhdHd = fullHeader(buf, mdhdBox.payloadOffset);
  const mdhdVersion = mdhdHd.version;
  let mdhdTimescale: number;
  let mdhdDuration: number;
  if (mdhdVersion === 1) {
    mdhdTimescale = r32(buf, mdhdHd.payloadStart + 16);
    mdhdDuration = Number(r64(buf, mdhdHd.payloadStart + 20));
  } else {
    mdhdTimescale = r32(buf, mdhdHd.payloadStart + 8);
    mdhdDuration = r32(buf, mdhdHd.payloadStart + 12);
  }

  const hdlrBox = findBox(buf, mp, me, "hdlr");
  if (!hdlrBox) return null;
  const hdlrRaw = rawBox(buf, hdlrBox);
  const hOff = hdlrBox.payloadOffset;
  const handlerType = String.fromCharCode(buf[hOff + 4], buf[hOff + 5], buf[hOff + 6], buf[hOff + 7]);

  const minfBox = findBox(buf, mp, me, "minf");
  if (!minfBox) return null;
  const mip = minfBox.payloadOffset;
  const mie = minfBox.offset + minfBox.size;
  const vmhdRaw = findBox(buf, mip, mie, "vmhd") ? rawBox(buf, findBox(buf, mip, mie, "vmhd")!) : null;
  const smhdRaw = findBox(buf, mip, mie, "smhd") ? rawBox(buf, findBox(buf, mip, mie, "smhd")!) : null;
  const dinfRaw = findBox(buf, mip, mie, "dinf") ? rawBox(buf, findBox(buf, mip, mie, "dinf")!) : null;

  const stblBox = findBox(buf, mip, mie, "stbl");
  if (!stblBox) return null;
  const sp = stblBox.payloadOffset;
  const se = stblBox.offset + stblBox.size;
  const stsdBox = findBox(buf, sp, se, "stsd");
  if (!stsdBox) return null;
  const stsdRaw = rawBox(buf, stsdBox);
  const sttsBox = findBox(buf, sp, se, "stts");
  if (!sttsBox) return null;
  const stts = parseSttsEntries(buf, fullHeader(buf, sttsBox.payloadOffset).payloadStart);
  const cttsBox = findBox(buf, sp, se, "ctts");
  const ctts = cttsBox ? parseCttsEntries(buf, fullHeader(buf, cttsBox.payloadOffset).payloadStart) : null;
  const stscBox = findBox(buf, sp, se, "stsc");
  if (!stscBox) return null;
  const stsc = parseStscEntries(buf, fullHeader(buf, stscBox.payloadOffset).payloadStart);
  const stszBox = findBox(buf, sp, se, "stsz");
  if (!stszBox) return null;
  const stsz = parseStsz(buf, fullHeader(buf, stszBox.payloadOffset).payloadStart);
  const stcoBox = findBox(buf, sp, se, "stco");
  const co64Box = findBox(buf, sp, se, "co64");
  let chunkOffsets: number[] = [];
  let isCo64 = false;
  if (stcoBox) {
    chunkOffsets = parseStco(buf, fullHeader(buf, stcoBox.payloadOffset).payloadStart);
  } else if (co64Box) {
    chunkOffsets = parseCo64(buf, fullHeader(buf, co64Box.payloadOffset).payloadStart).map((v) => Number(v));
    isCo64 = true;
  } else {
    return null;
  }
  const stssBox = findBox(buf, sp, se, "stss");
  const stss = stssBox ? parseStss(buf, fullHeader(buf, stssBox.payloadOffset).payloadStart) : null;

  const stbl: Stbl = {
    stsdRaw,
    stts,
    ctts,
    stsc,
    stsz,
    chunkOffsets,
    isCo64,
    stss,
    chunkCount: chunkOffsets.length,
    sampleCount: stsz.sizes.length,
  };
  return {
    handlerType,
    tkhdRaw,
    tkhdVersion,
    mdhdRaw,
    mdhdVersion,
    mdhdTimescale,
    mdhdDuration,
    hdlrRaw,
    vmhdRaw,
    smhdRaw,
    dinfRaw,
    stbl,
  };
}

function parseClip(buf: Uint8Array): Clip {
  let ftypRaw: Uint8Array | null = null;
  let moovBox: Box | null = null;
  let mdatBox: Box | null = null;
  for (const b of iterBoxes(buf, 0, buf.length)) {
    if (b.type === "ftyp" && !ftypRaw) ftypRaw = rawBox(buf, b);
    else if (b.type === "moov" && !moovBox) moovBox = b;
    else if (b.type === "mdat" && !mdatBox) mdatBox = b;
  }
  if (!ftypRaw) throw new Error("ftyp ausente no clipe MP4.");
  if (!moovBox) throw new Error("moov ausente no clipe MP4.");
  if (!mdatBox) throw new Error("mdat ausente no clipe MP4.");

  const mvhdBox = findBox(buf, moovBox.payloadOffset, moovBox.offset + moovBox.size, "mvhd");
  if (!mvhdBox) throw new Error("mvhd ausente no moov.");
  const mvhdRaw = rawBox(buf, mvhdBox);
  const mhHd = fullHeader(buf, mvhdBox.payloadOffset);
  const mvhdVersion = mhHd.version;
  let mvhdTimescale: number;
  let mvhdDuration: number;
  if (mvhdVersion === 1) {
    mvhdTimescale = r32(buf, mhHd.payloadStart + 16);
    mvhdDuration = Number(r64(buf, mhHd.payloadStart + 20));
  } else {
    mvhdTimescale = r32(buf, mhHd.payloadStart + 8);
    mvhdDuration = r32(buf, mhHd.payloadStart + 12);
  }

  const tracks: Track[] = [];
  for (const b of iterBoxes(buf, moovBox.payloadOffset, moovBox.offset + moovBox.size)) {
    if (b.type === "trak") {
      const t = parseTrak(buf, b);
      if (t) tracks.push(t);
    }
  }
  return {
    buf,
    ftypRaw,
    mdatDataStart: mdatBox.payloadOffset,
    mdatDataEnd: mdatBox.offset + mdatBox.size,
    mvhdRaw,
    mvhdVersion,
    mvhdTimescale,
    mvhdDuration,
    tracks,
  };
}

function patchMvhdDuration(raw: Uint8Array, newDuration: number, version: number): Uint8Array {
  const out = raw.slice();
  if (version === 1) out.set(w64(BigInt(newDuration)), 32);
  else {
    if (newDuration > 0xffffffff) throw new Error("Duração mvhd v0 excede 32 bits — fora do escopo.");
    out.set(w32(newDuration), 24);
  }
  return out;
}
function patchTkhdDuration(raw: Uint8Array, newDuration: number, version: number): Uint8Array {
  const out = raw.slice();
  if (version === 1) out.set(w64(BigInt(newDuration)), 36);
  else {
    if (newDuration > 0xffffffff) throw new Error("Duração tkhd v0 excede 32 bits — fora do escopo.");
    out.set(w32(newDuration), 28);
  }
  return out;
}
function patchMdhdDuration(raw: Uint8Array, newDuration: number, version: number): Uint8Array {
  const out = raw.slice();
  if (version === 1) out.set(w64(BigInt(newDuration)), 32);
  else {
    if (newDuration > 0xffffffff) throw new Error("Duração mdhd v0 excede 32 bits — fora do escopo.");
    out.set(w32(newDuration), 24);
  }
  return out;
}
function readTkhdDuration(raw: Uint8Array, version: number): number {
  return version === 1 ? Number(r64(raw, 36)) : r32(raw, 28);
}

function buildStts(entries: { count: number; delta: number }[]): Uint8Array {
  const body = new Uint8Array(4 + entries.length * 8);
  body.set(w32(entries.length), 0);
  let o = 4;
  for (const e of entries) { body.set(w32(e.count), o); o += 4; body.set(wi32(e.delta), o); o += 4; }
  return mkFullBox("stts", 0, 0, body);
}
function buildCtts(entries: { count: number; offset: number }[]): Uint8Array {
  const body = new Uint8Array(4 + entries.length * 8);
  body.set(w32(entries.length), 0);
  let o = 4;
  for (const e of entries) { body.set(w32(e.count), o); o += 4; body.set(wi32(e.offset), o); o += 4; }
  return mkFullBox("ctts", 0, 0, body);
}
function buildStsc(entries: { firstChunk: number; samplesPerChunk: number; sampleDescIndex: number }[]): Uint8Array {
  const body = new Uint8Array(4 + entries.length * 12);
  body.set(w32(entries.length), 0);
  let o = 4;
  for (const e of entries) {
    body.set(w32(e.firstChunk), o); o += 4;
    body.set(w32(e.samplesPerChunk), o); o += 4;
    body.set(w32(e.sampleDescIndex), o); o += 4;
  }
  return mkFullBox("stsc", 0, 0, body);
}
function buildStsz(sizes: number[]): Uint8Array {
  const body = new Uint8Array(8 + sizes.length * 4);
  body.set(w32(0), 0);
  body.set(w32(sizes.length), 4);
  let o = 8;
  for (const s of sizes) { body.set(w32(s), o); o += 4; }
  return mkFullBox("stsz", 0, 0, body);
}
function buildStcoOrCo64(offsets: number[]): Uint8Array {
  let maxOff = 0;
  for (const o of offsets) if (o > maxOff) maxOff = o;
  const useCo64 = maxOff > 0xfffffffe;
  const body = new Uint8Array(4 + offsets.length * (useCo64 ? 8 : 4));
  body.set(w32(offsets.length), 0);
  let o = 4;
  for (const off of offsets) {
    if (useCo64) { body.set(w64(BigInt(off)), o); o += 8; }
    else { body.set(w32(off), o); o += 4; }
  }
  return mkFullBox(useCo64 ? "co64" : "stco", 0, 0, body);
}
function buildStss(sampleNumbers: number[]): Uint8Array {
  const body = new Uint8Array(4 + sampleNumbers.length * 4);
  body.set(w32(sampleNumbers.length), 0);
  let o = 4;
  for (const s of sampleNumbers) { body.set(w32(s), o); o += 4; }
  return mkFullBox("stss", 0, 0, body);
}

function buildTrakForOutput(
  trackIdx: number,
  clips: Clip[],
  clipMdatDataStarts: number[],
  ftypLength: number,
  mdatHeaderSize: number,
): Uint8Array {
  const first = clips[0];
  const firstBuf = first.buf;
  const moovBox = findBox(firstBuf, 0, firstBuf.length, "moov");
  if (!moovBox) throw new Error("moov do clipe 0 ausente.");
  let trakBoxFirst: Box | null = null;
  let i = 0;
  for (const b of iterBoxes(firstBuf, moovBox.payloadOffset, moovBox.offset + moovBox.size)) {
    if (b.type === "trak") {
      if (i === trackIdx) { trakBoxFirst = b; break; }
      i++;
    }
  }
  if (!trakBoxFirst) throw new Error("trak " + trackIdx + " ausente no clipe 0.");

  const trackPerClip: Track[] = [];
  for (const c of clips) if (c.tracks[trackIdx]) trackPerClip.push(c.tracks[trackIdx]);
  if (trackPerClip.length === 0) throw new Error("Track " + trackIdx + " não encontrado em nenhum clipe.");

  let totalMdhdDuration = 0;
  let totalTkhdDuration = 0;
  for (const t of trackPerClip) {
    totalMdhdDuration += t.mdhdDuration;
    totalTkhdDuration += readTkhdDuration(t.tkhdRaw, t.tkhdVersion);
  }
  const firstTrack = trackPerClip[0];
  const newTkhd = patchTkhdDuration(firstTrack.tkhdRaw, totalTkhdDuration, firstTrack.tkhdVersion);
  const newMdhd = patchMdhdDuration(firstTrack.mdhdRaw, totalMdhdDuration, firstTrack.mdhdVersion);

  const sttsEntries: { count: number; delta: number }[] = [];
  for (const t of trackPerClip) for (const e of t.stbl.stts) sttsEntries.push(e);
  const haveAllCtts = trackPerClip.every((t) => t.stbl.ctts !== null);
  const cttsEntries: { count: number; offset: number }[] = [];
  if (haveAllCtts) for (const t of trackPerClip) for (const e of t.stbl.ctts!) cttsEntries.push(e);

  const allSizes: number[] = [];
  for (const t of trackPerClip) allSizes.push(...t.stbl.stsz.sizes);

  const stscEntries: { firstChunk: number; samplesPerChunk: number; sampleDescIndex: number }[] = [];
  let cumulativeChunkCount = 0;
  for (const t of trackPerClip) {
    for (const e of t.stbl.stsc) {
      stscEntries.push({
        firstChunk: e.firstChunk + cumulativeChunkCount,
        samplesPerChunk: e.samplesPerChunk,
        sampleDescIndex: e.sampleDescIndex,
      });
    }
    cumulativeChunkCount += t.stbl.chunkCount;
  }

  const newChunkOffsets: number[] = [];
  for (let ci = 0; ci < clips.length; ci++) {
    const t = trackPerClip[ci];
    const clipOldMdatDataStart = clips[ci].mdatDataStart;
    const clipNewMdatDataStart = ftypLength + mdatHeaderSize + clipMdatDataStarts[ci];
    for (const oldOffset of t.stbl.chunkOffsets) {
      newChunkOffsets.push(oldOffset - clipOldMdatDataStart + clipNewMdatDataStart);
    }
  }

  const haveAllStss = trackPerClip.every((t) => t.stbl.stss !== null);
  const stssNumbers: number[] = [];
  if (haveAllStss) {
    let cumulativeSamples = 0;
    for (const t of trackPerClip) {
      for (const sn of t.stbl.stss!) stssNumbers.push(sn + cumulativeSamples);
      cumulativeSamples += t.stbl.sampleCount;
    }
  }

  const stblParts: Uint8Array[] = [firstTrack.stbl.stsdRaw, buildStts(sttsEntries)];
  if (haveAllCtts) stblParts.push(buildCtts(cttsEntries));
  stblParts.push(buildStsc(stscEntries));
  stblParts.push(buildStsz(allSizes));
  stblParts.push(buildStcoOrCo64(newChunkOffsets));
  if (haveAllStss) stblParts.push(buildStss(stssNumbers));
  const newStbl = mkBox("stbl", cat(stblParts));

  const minfParts: Uint8Array[] = [];
  if (firstTrack.vmhdRaw) minfParts.push(firstTrack.vmhdRaw);
  if (firstTrack.smhdRaw) minfParts.push(firstTrack.smhdRaw);
  if (firstTrack.dinfRaw) minfParts.push(firstTrack.dinfRaw);
  minfParts.push(newStbl);
  const newMinf = mkBox("minf", cat(minfParts));

  const mdiaParts: Uint8Array[] = [newMdhd];
  if (firstTrack.hdlrRaw) mdiaParts.push(firstTrack.hdlrRaw);
  mdiaParts.push(newMinf);
  const newMdia = mkBox("mdia", cat(mdiaParts));

  const trakParts: Uint8Array[] = [newTkhd, newMdia];
  return mkBox("trak", cat(trakParts));
}

function buildMoov(
  clips: Clip[],
  clipMdatDataStarts: number[],
  ftypLength: number,
  mdatHeaderSize: number,
): Uint8Array {
  const first = clips[0];
  let totalMvhdDuration = 0;
  for (const c of clips) totalMvhdDuration += c.mvhdDuration;
  const newMvhd = patchMvhdDuration(first.mvhdRaw, totalMvhdDuration, first.mvhdVersion);
  const numTracks = first.tracks.length;
  const trakBoxes: Uint8Array[] = [];
  for (let i = 0; i < numTracks; i++) {
    trakBoxes.push(buildTrakForOutput(i, clips, clipMdatDataStarts, ftypLength, mdatHeaderSize));
  }
  return mkBox("moov", cat([newMvhd, ...trakBoxes]));
}

function combineMdat(clips: Clip[]): { mdatBytes: Uint8Array; clipMdatDataStarts: number[]; mdatHeaderSize: number } {
  const clipMdatDataStarts: number[] = [];
  let totalLen = 0;
  for (const c of clips) {
    clipMdatDataStarts.push(totalLen);
    totalLen += c.mdatDataEnd - c.mdatDataStart;
  }
  const mdatData = new Uint8Array(totalLen);
  let off = 0;
  for (const c of clips) {
    const len = c.mdatDataEnd - c.mdatDataStart;
    mdatData.set(c.buf.subarray(c.mdatDataStart, c.mdatDataEnd), off);
    off += len;
  }
  const totalSize = 8 + mdatData.length;
  const mdatHeaderSize = totalSize <= 0xffffffff ? 8 : 16;
  let mdatBytes: Uint8Array;
  if (mdatHeaderSize === 8) {
    mdatBytes = cat([w32(totalSize), asc("mdat"), mdatData]);
  } else {
    mdatBytes = cat([w32(1), asc("mdat"), w64(BigInt(16 + mdatData.length)), mdatData]);
  }
  return { mdatBytes, clipMdatDataStarts, mdatHeaderSize };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function validateClipsCompatible(clips: Clip[]): void {
  const first = clips[0];
  for (let ci = 1; ci < clips.length; ci++) {
    const c = clips[ci];
    if (c.mvhdTimescale !== first.mvhdTimescale) {
      throw new Error(
        `Clipe ${ci} tem timescale de vídeo (mvhd) ${c.mvhdTimescale} diferente do clipe 0 (${first.mvhdTimescale}). Os clipes precisam usar a mesma taxa de tempo para serem concatenados sem dessincronizar.`
      );
    }
    if (c.tracks.length !== first.tracks.length) {
      throw new Error(`Clipe ${ci} tem ${c.tracks.length} tracks vs ${first.tracks.length} no clipe 0.`);
    }
    for (let ti = 0; ti < first.tracks.length; ti++) {
      const ft = first.tracks[ti];
      const t = c.tracks[ti];
      if (t.handlerType !== ft.handlerType) {
        throw new Error(
          `Clipe ${ci} tem a track ${ti} do tipo "${t.handlerType}", mas o clipe 0 tem "${ft.handlerType}" na mesma posição — a ordem das tracks precisa ser idêntica entre os clipes.`
        );
      }
      if (t.mdhdTimescale !== ft.mdhdTimescale) {
        throw new Error(
          `Clipe ${ci} tem timescale ${t.mdhdTimescale} na track ${ti} (${t.handlerType}) diferente do clipe 0 (${ft.mdhdTimescale}).`
        );
      }
      if (!bytesEqual(t.stbl.stsdRaw, ft.stbl.stsdRaw)) {
        throw new Error(
          `Clipe ${ci} tem parâmetros de codec (stsd) diferentes do clipe 0 na track ${ti} (${t.handlerType}) — provável mudança de resolução/perfil entre as cenas geradas.`
        );
      }
    }
  }
}

function json(o: unknown, status = 200): Response {
  return new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, message: "Use POST." }, 405);
  let body: { clip_paths?: unknown; project_id?: unknown };
  try { body = await req.json(); } catch { return json({ ok: false, message: "JSON inválido." }, 400); }
  const clip_paths = Array.isArray(body?.clip_paths) ? body.clip_paths as unknown[] : null;
  if (!clip_paths || clip_paths.length === 0) return json({ ok: false, message: "Sem clipes para montar." }, 400);
  const project_id = (typeof body?.project_id === "string" && body.project_id) || crypto.randomUUID();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ ok: false, message: "Supabase env ausente." }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const clipBuffers: Uint8Array[] = [];
    for (const path of clip_paths) {
      if (typeof path !== "string") continue;
      const { data: signed, error: sErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, 90);
      if (sErr || !signed?.signedUrl) return json({ ok: false, message: `URL assinada falhou: ${path}` }, 500);
      const res = await fetch(signed.signedUrl, { cache: "no-store" });
      if (!res.ok) return json({ ok: false, message: `Falha ao baixar clipe: ${path} (${res.status})` }, 502);
      const ab = await res.arrayBuffer();
      clipBuffers.push(new Uint8Array(ab));
    }
    if (clipBuffers.length === 0) return json({ ok: false, message: "Nenhum clipe válido." }, 400);

    const clips: Clip[] = clipBuffers.map(parseClip);
    try {
      validateClipsCompatible(clips);
    } catch (e) {
      return json({ ok: false, message: (e as Error).message }, 400);
    }

    const ftypRaw = clips[0].ftypRaw;
    const { mdatBytes, clipMdatDataStarts, mdatHeaderSize } = combineMdat(clips);
    const moovBytes = buildMoov(clips, clipMdatDataStarts, ftypRaw.length, mdatHeaderSize);
    const outBytes = cat([ftypRaw, mdatBytes, moovBytes]);

    const finalKey = `${FINAL_PREFIX}${project_id}.mp4`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(finalKey, outBytes, {
      contentType: "video/mp4",
      upsert: true,
    });
    if (upErr) return json({ ok: false, message: `Upload final falhou: ${upErr.message}` }, 500);

    const { data: finalSigned, error: fErr } = await supabase.storage.from(BUCKET).createSignedUrl(finalKey, SIGNED_TTL_SEC);
    if (fErr || !finalSigned?.signedUrl) return json({ ok: false, message: "Upload OK, mas URL assinada falhou." }, 500);

    return json({
      ok: true,
      video_url: finalSigned.signedUrl,
      expires_at: new Date(Date.now() + SIGNED_TTL_SEC * 1000).toISOString(),
    }, 200);
  } catch (e) {
    return json({ ok: false, message: `Montagem falhou: ${(e as Error).message}` }, 500);
  }
});