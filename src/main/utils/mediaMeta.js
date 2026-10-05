import fs from 'node:fs'

// "能不能播、算视频还是音频"由 shared 里那一份统一判断（渲染进程也要用同一个结论）
export { mediaKindOf, isPlayableMedia, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS } from '@shared/mediaKinds'

/**
 * 读媒体文件的元数据：**标题 / 艺术家 / 专辑 / 封面**。
 *
 * 为什么放在主进程用 JS 自己解、而不去调媒体引擎：
 * 这几个字段与"能不能解码播放"无关，读的只是文件头里的一小段结构化数据；
 * 引擎那边是"搬字节/解码"的职责，不该为了一行标题付出一次进程启动。
 *
 * 实现原则：**只读必要的字节**（box 头 / metadata block），绝不把整个文件读进来 ——
 * 播放 BT 正在下载的文件时，这些位置很可能还没落盘，读不到就如实返回空，
 * 让播放器退回"用文件名当标题"。
 */
export function readMediaMeta (filePath) {
  let fd = null
  try {
    fd = fs.openSync(filePath, 'r')
    const size = fs.fstatSync(fd).size
    if (size < 16) {
      return {}
    }
    const head = readAt(fd, 0, Math.min(16, size))
    if (head.length >= 8 && head.slice(4, 8).toString('latin1') === 'ftyp') {
      return readMp4(fd, size)
    }
    if (head.slice(0, 4).toString('latin1') === 'fLaC') {
      return readFlac(fd, size)
    }
    if (head.slice(0, 3).toString('latin1') === 'ID3') {
      return readId3(fd, size)
    }
    return {}
  } catch (_) {
    return {}
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd) } catch (_) {}
    }
  }
}

// ─────────────────────────── 通用小工具 ───────────────────────────

function readAt (fd, pos, len) {
  if (len <= 0) {
    return Buffer.alloc(0)
  }
  const buf = Buffer.alloc(len)
  const got = fs.readSync(fd, buf, 0, len, pos)
  return got === len ? buf : buf.subarray(0, got)
}

/**
 * 遍历 `[start, end)` 范围内的 box（只读 8/16 字节头，不碰载荷）。
 * 越界/长度不合法就停下 —— 对正在下载的文件这是常态，不是错误。
 */
function* boxes (fd, start, end) {
  let pos = start
  let guard = 0
  while (pos + 8 <= end && guard++ < 4096) {
    const hdr = readAt(fd, pos, 8)
    if (hdr.length < 8) {
      return
    }
    let size = hdr.readUInt32BE(0)
    const type = hdr.slice(4, 8).toString('latin1')
    let headerLen = 8
    if (size === 1) {
      const ext = readAt(fd, pos + 8, 8)
      if (ext.length < 8) {
        return
      }
      size = Number(ext.readBigUInt64BE(0))
      headerLen = 16
    } else if (size === 0) {
      size = end - pos
    }
    if (size < headerLen || pos + size > end) {
      return
    }
    yield { type, payloadStart: pos + headerLen, end: pos + size }
    pos += size
  }
}

function findBox (fd, start, end, type) {
  for (const b of boxes(fd, start, end)) {
    if (b.type === type) {
      return b
    }
  }
  return null
}

/**
 * 视频轨的像素尺寸。
 *
 * `tkhd` 的**最后 8 字节**就是 16.16 定点的宽高（version 0/1 都一样，它在末尾），
 * 所以不用管版本差异。音频轨的这两个字段是 0，会被跳过。
 */
function readTrackSize (fd, moov) {
  try {
    for (const trak of boxes(fd, moov.payloadStart, moov.end)) {
      if (trak.type !== 'trak') {
        continue
      }
      const tkhd = findBox(fd, trak.payloadStart, trak.end, 'tkhd')
      if (!tkhd || tkhd.end - tkhd.payloadStart < 8) {
        continue
      }
      const tail = readAt(fd, tkhd.end - 8, 8)
      if (tail.length < 8) {
        continue
      }
      const w = tail.readUInt32BE(0) >>> 16
      const h = tail.readUInt32BE(4) >>> 16
      if (w > 0 && h > 0 && w <= 16384 && h <= 16384) {
        return { width: w, height: h }
      }
    }
  } catch (_) {}
  return null
}

// ─────────────────────────── MP4 / M4A ───────────────────────────

/** `moov/udta/meta/ilst` 里的 `©nam`(标题) `©ART`(艺术家) `©alb`(专辑) `covr`(封面)。 */
function readMp4 (fd, size) {
  const out = {}
  let moov = null
  for (const b of boxes(fd, 0, size)) {
    if (b.type === 'moov') {
      moov = b
      break
    }
  }
  if (!moov) {
    return out
  }

  // 画面尺寸：播放器窗口要按它设宽高比 —— 窗口比例与画面不一致时，
  // 无论怎么摆都会留黑边。音频文件的 tkhd 宽高是 0，这里自然拿不到。
  const dim = readTrackSize(fd, moov)
  if (dim) {
    out.videoSize = dim
  }

  let udta = null
  for (const b of boxes(fd, moov.payloadStart, moov.end)) {
    if (b.type === 'udta') {
      udta = b
      break
    }
  }
  if (!udta) {
    return out
  }
  let meta = null
  for (const b of boxes(fd, udta.payloadStart, udta.end)) {
    if (b.type === 'meta') {
      meta = b
      break
    }
  }
  if (!meta) {
    return out
  }
  // meta 是 FullBox：载荷前 4 字节是 version + flags，真正的子 box 从 +4 开始
  let ilst = null
  for (const b of boxes(fd, meta.payloadStart + 4, meta.end)) {
    if (b.type === 'ilst') {
      ilst = b
      break
    }
  }
  if (!ilst) {
    return out
  }

  const readDataBox = (item) => {
    const data = findBox(fd, item.payloadStart, item.end, 'data')
    if (!data) {
      return null
    }
    const body = readAt(fd, data.payloadStart, Math.min(data.end - data.payloadStart, 8))
    const payloadLen = data.end - data.payloadStart
    if (body.length < 8) {
      return null
    }
    const dataType = body.readUInt32BE(0) & 0x00ffffff
    // `data` 载荷 = 4 字节 type/locale + 4 字节 locale + 真正的数据
    const len = payloadLen - 8
    if (len <= 0) {
      return null
    }
    return { dataType, read: () => readAt(fd, data.payloadStart + 8, len), len }
  }

  const TEXT_TAGS = { '©nam': 'title', '©ART': 'artist', 'aART': 'artist', '©alb': 'album' }
  for (const item of boxes(fd, ilst.payloadStart, ilst.end)) {
    const tag = TEXT_TAGS[item.type]
    if (tag && !out[tag]) {
      const d = readDataBox(item)
      if (d && d.len <= 8192) {
        out[tag] = d.read().toString('utf8').replace(/\0+$/, '').trim()
      }
      continue
    }
    if (item.type === 'covr' && !out.cover) {
      const d = readDataBox(item)
      // 封面可能很大，设个上限（base64 之后还要再涨 1/3）
      if (d && d.len > 0 && d.len <= 4 * 1024 * 1024) {
        const mime = d.dataType === 14 ? 'image/png' : 'image/jpeg'
        out.cover = `data:${mime};base64,${d.read().toString('base64')}`
      }
    }
  }
  return out
}

// ─────────────────────────── FLAC ───────────────────────────

/** FLAC 的 Vorbis comment（TITLE/ARTIST/ALBUM）与 PICTURE block。 */
function readFlac (fd, size) {
  const out = {}
  let pos = 4 // 跳过 "fLaC"
  let guard = 0
  while (pos + 4 <= size && guard++ < 64) {
    const hdr = readAt(fd, pos, 4)
    if (hdr.length < 4) {
      break
    }
    const last = (hdr[0] & 0x80) !== 0
    const type = hdr[0] & 0x7f
    const len = (hdr[1] << 16) | (hdr[2] << 8) | hdr[3]
    const blockStart = pos + 4
    if (blockStart + len > size) {
      break
    }
    if (type === 4) {
      parseVorbisComment(readAt(fd, blockStart, Math.min(len, 256 * 1024)), out)
    } else if (type === 6 && !out.cover) {
      parseFlacPicture(readAt(fd, blockStart, Math.min(len, 4 * 1024 * 1024)), out)
    }
    pos = blockStart + len
    if (last) {
      break
    }
  }
  return out
}

function parseVorbisComment (buf, out) {
  try {
    let p = 0
    const vendorLen = buf.readUInt32LE(p); p += 4 + vendorLen
    const count = buf.readUInt32LE(p); p += 4
    for (let i = 0; i < count && p + 4 <= buf.length; i++) {
      const len = buf.readUInt32LE(p); p += 4
      if (p + len > buf.length) break
      const kv = buf.slice(p, p + len).toString('utf8'); p += len
      const eq = kv.indexOf('=')
      if (eq <= 0) continue
      const key = kv.slice(0, eq).toUpperCase()
      const value = kv.slice(eq + 1).trim()
      if (key === 'TITLE' && !out.title) out.title = value
      else if (key === 'ARTIST' && !out.artist) out.artist = value
      else if (key === 'ALBUM' && !out.album) out.album = value
    }
  } catch (_) {}
}

function parseFlacPicture (buf, out) {
  try {
    let p = 4 // 跳过 picture type
    const mimeLen = buf.readUInt32BE(p); p += 4
    const mime = buf.slice(p, p + mimeLen).toString('latin1'); p += mimeLen
    const descLen = buf.readUInt32BE(p); p += 4 + descLen
    p += 16 // width/height/depth/colors
    const dataLen = buf.readUInt32BE(p); p += 4
    if (dataLen <= 0 || p + dataLen > buf.length) return
    const mimeType = /png/i.test(mime) ? 'image/png' : 'image/jpeg'
    out.cover = `data:${mimeType};base64,${buf.slice(p, p + dataLen).toString('base64')}`
  } catch (_) {}
}

// ─────────────────────────── ID3v2（mp3）───────────────────────────

function readId3 (fd, size) {
  const out = {}
  try {
    const hdr = readAt(fd, 0, 10)
    if (hdr.length < 10) {
      return out
    }
    const flags = hdr[5]
    const tagSize = ((hdr[6] & 0x7f) << 21) | ((hdr[7] & 0x7f) << 14) | ((hdr[8] & 0x7f) << 7) | (hdr[9] & 0x7f)
    let start = 10
    if (flags & 0x40) {
      // 扩展头
      const ext = readAt(fd, start, 4)
      if (ext.length === 4) {
        start += 4 + ext.readUInt32BE(0)
      }
    }
    const end = Math.min(10 + tagSize, size)
    const buf = readAt(fd, start, Math.min(end - start, 4 * 1024 * 1024))
    let p = 0
    while (p + 10 <= buf.length) {
      const id = buf.slice(p, p + 4).toString('latin1')
      if (!/^[A-Z0-9]{4}$/.test(id)) break
      const frameSize = ((buf[p + 4] & 0x7f) << 21) | ((buf[p + 5] & 0x7f) << 14) | ((buf[p + 6] & 0x7f) << 7) | (buf[p + 7] & 0x7f)
      if (frameSize <= 0 || p + 10 + frameSize > buf.length) break
      const body = buf.slice(p + 10, p + 10 + frameSize)
      if (id === 'TIT2' && !out.title) out.title = decodeId3Text(body)
      else if (id === 'TPE1' && !out.artist) out.artist = decodeId3Text(body)
      else if (id === 'TALB' && !out.album) out.album = decodeId3Text(body)
      else if (id === 'APIC' && !out.cover) out.cover = decodeId3Picture(body)
      p += 10 + frameSize
    }
  } catch (_) {}
  return out
}

function decodeId3Text (body) {
  try {
    if (!body.length) return ''
    const enc = body[0]
    const data = body.slice(1)
    if (enc === 1 || enc === 2) {
      return data.toString('utf16le').replace(/\0+$/, '').trim()
    }
    return data.toString('utf8').replace(/\0+$/, '').trim()
  } catch (_) {
    return ''
  }
}

function decodeId3Picture (body) {
  try {
    let p = 1
    const mimeEnd = body.indexOf(0, p)
    if (mimeEnd < 0) return ''
    const mime = body.slice(p, mimeEnd).toString('latin1')
    p = mimeEnd + 1
    p += 1 // picture type
    const descEnd = body.indexOf(0, p)
    if (descEnd < 0) return ''
    p = descEnd + 1
    const img = body.slice(p)
    if (!img.length) return ''
    return `data:${/png/i.test(mime) ? 'image/png' : 'image/jpeg'};base64,${img.toString('base64')}`
  } catch (_) {
    return ''
  }
}
