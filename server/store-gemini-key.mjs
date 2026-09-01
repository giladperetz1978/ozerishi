import readline from 'node:readline'
import { saveGeminiKey } from './vault.js'

const input = readline.createInterface({ input: process.stdin, terminal: false })
let value = ''
input.on('line', (line) => { value += line })
input.on('close', async () => {
  if (value.trim().length < 10) process.exitCode = 1
  else await saveGeminiKey(value)
})