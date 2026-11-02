import { describe, expect, it } from 'vitest'
import { boxes, codecString, splitFragments } from '../src/node/encode'

const box = (type: string, payload: Buffer = Buffer.alloc(0)) => {
  const b = Buffer.alloc(8 + payload.length)
  b.writeUInt32BE(b.length, 0)
  b.write(type, 4, 'latin1')
  payload.copy(b, 8)
  return b
}

describe('ISO-BMFF helpers', () => {
  it('walks top-level boxes', () => {
    const buf = Buffer.concat([box('ftyp', Buffer.from('isom')), box('moov', Buffer.alloc(12)), box('moof'), box('mdat', Buffer.alloc(5))])
    expect(boxes(buf).map((b) => b.type)).toEqual(['ftyp', 'moov', 'moof', 'mdat'])
    expect(boxes(buf).at(-1)!.end).toBe(buf.length)
  })

  it('splits an init segment from moof+mdat fragments', () => {
    const init = Buffer.concat([box('ftyp'), box('moov', Buffer.alloc(4))])
    const f1 = Buffer.concat([box('moof'), box('mdat', Buffer.alloc(10))])
    const f2 = Buffer.concat([box('moof'), box('mdat', Buffer.alloc(20))])
    const r = splitFragments(Buffer.concat([init, f1, f2]))
    expect(r.init.equals(init)).toBe(true)
    expect(r.frags).toHaveLength(2)
    expect(r.frags[0].equals(f1)).toBe(true)
    expect(r.frags[1].equals(f2)).toBe(true)
  })

  it('rejects files that are not fragmented MP4', () => {
    expect(() => splitFragments(box('ftyp'))).toThrow(/moov/)
  })

  it('reads the avc1 codec string', () => {
    // avcC: configurationVersion, profile (Main 0x4d), compat, level (3.1 = 0x1f)
    const init = Buffer.concat([Buffer.from('xxavcC'), Buffer.from([1, 0x4d, 0x40, 0x1f])])
    expect(codecString(init)).toBe('avc1.4D401F')
  })

  it('reads the av01 codec string', () => {
    // av1C: marker/version, profile 0 + level 4 (0x04), tier 0 / 8-bit
    const init = Buffer.concat([Buffer.from('xxav1C'), Buffer.from([0x81, 0x04, 0x0c])])
    expect(codecString(init)).toBe('av01.0.04M.08')
  })
})
