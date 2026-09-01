import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(root, 'data')
const keyFile = path.join(dataDir, '.vault-key')
const secretFile = path.join(dataDir, '.gemini.enc')

async function masterKey() {
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 })
  try {
    const stored = await fs.readFile(keyFile)
    return stored.length === 32 ? stored : Buffer.from(stored.toString('utf8').trim(), 'hex')
  } catch {
    const key = crypto.randomBytes(32)
    await fs.writeFile(keyFile, key, { mode: 0o600 })
    return key
  }
}

export async function saveGeminiKey(value) {
  const key = await masterKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value.trim(), 'utf8'), cipher.final()])
  const payload = { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') }
  await fs.writeFile(secretFile, JSON.stringify(payload), { mode: 0o600 })
}

export async function getGeminiKey() {
  try {
    const key = await masterKey()
    const payload = JSON.parse(await fs.readFile(secretFile, 'utf8'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8')
  } catch { return process.env.GEMINI_API_KEY || null }
}