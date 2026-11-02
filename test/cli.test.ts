import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const cli = new URL('../dist/cli.js', import.meta.url).pathname
const run = (...a: string[]) => spawnSync(process.execPath, [cli, ...a], { encoding: 'utf8' })

describe.runIf(existsSync(cli))('cli', () => {
  it('prints help', () => {
    const r = run('--help')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/instant-video encode <input\.\.\.>/)
    expect(r.stdout).toMatch(/--full <heights>/)
  })

  it('prints the version', () => {
    expect(run('--version').stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('fails on an unknown command and a missing file', () => {
    expect(run('nope').status).toBe(1)
    const r = run('encode', '/definitely/not/here.mp4')
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/not found/)
  })
})
