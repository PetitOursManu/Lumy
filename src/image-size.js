/**
 * Width and height of an image file, read from its header.
 *
 * Writing both attributes on every <img> lets the browser reserve the space
 * before the file arrives, so the text does not jump while a page loads.
 */
import { open } from 'node:fs/promises'

export async function imageSize(file) {
  let handle
  try {
    handle = await open(file, 'r')
    const buf = Buffer.alloc(64 * 1024)
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
    return sizeFromBuffer(buf.subarray(0, bytesRead), file)
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}

export function sizeFromBuffer(b, name = '') {
  if (b.length < 24) return null
  // PNG
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  // GIF
  if (b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
  // WebP
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16)
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
  }
  // JPEG: walk the markers to the first start-of-frame.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const marker = b[i + 1]
      const len = b.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
      }
      i += 2 + len
    }
    return null
  }
  // SVG
  if (/\.svg$/i.test(name) || b.toString('utf8', 0, 256).includes('<svg')) {
    const head = b.toString('utf8', 0, Math.min(b.length, 4096))
    const tag = head.match(/<svg\b[^>]*>/i)?.[0] || ''
    const w = tag.match(/\bwidth="([\d.]+)(px)?"/)?.[1]
    const h = tag.match(/\bheight="([\d.]+)(px)?"/)?.[1]
    if (w && h) return { width: Math.round(+w), height: Math.round(+h) }
    const vb = tag.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/)
    if (vb) return { width: Math.round(+vb[1]), height: Math.round(+vb[2]) }
  }
  return null
}
