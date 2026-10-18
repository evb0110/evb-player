// Runs in ordinary Node, isolating FFmpeg's ABI and allocator from Electron.
import {createRequire} from 'node:module'
import {createWriteStream} from 'node:fs'
import {once} from 'node:events'
import type {NativeFrame, NativeModule} from './mpv-service'

const native = createRequire(__filename)(process.argv[2]!) as NativeModule
const player = new native.MpvPlayer(JSON.parse(process.argv[3]!))
const frames = createWriteStream('', {fd: 4, autoClose: false})
const send = (message: unknown) => { if (process.connected) process.send?.(message) }
let size: [number, number] | undefined
let framePending = false, closing = false
let framePump: Promise<void> | undefined
let shutdownPromise: Promise<void> | undefined
const frameRequests: number[] = []
let updates = 0, renders = 0, renderMs = 0, maxRenderMs = 0, pipeMs = 0

async function writeFrame(id: number, frame: NativeFrame) {
  const header = Buffer.alloc(16)
  header.writeUInt32LE(id, 0)
  header.writeUInt32LE(frame.width, 4)
  header.writeUInt32LE(frame.height, 8)
  header.writeUInt32LE(frame.rgba.byteLength, 12)
  frames.write(header)
  const start = performance.now()
  if (!frames.write(frame.rgba)) await once(frames, 'drain')
  pipeMs += performance.now() - start
}

function queueFrame() {
  framePending = true
  if (framePump || !size || closing) return
  framePump = Promise.resolve().then(async () => {
    let answering: number[] = []
    try {
      while (framePending && !closing) {
        framePending = false
        const start = performance.now()
        const frame = player.renderFrame(...size!) as NativeFrame
        const elapsed = performance.now() - start
        renderMs += elapsed; maxRenderMs = Math.max(maxRenderMs, elapsed)
        // Zero denotes a pushed frame; nonzero ids answer viewport requests.
        answering = frameRequests.splice(0)
        for (const id of answering.length ? answering : [0]) await writeFrame(id, frame)
        answering = []
        if (++renders % 30 === 0 && process.env.EVB_PLAYER_TEST_DIAGNOSTICS === '1') console.error('Playback helper metrics', {updates, renders, renderMs: renderMs / renders, maxRenderMs, pipeMs: pipeMs / renders})
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      for (const id of new Set([...answering, ...frameRequests.splice(0)])) send({type: 'reply', id, error: message})
      if (!closing) send({type: 'events', events: [{id: -1, type: 'render-error', error: message}]})
    } finally {
      framePump = undefined
      if (framePending && !closing) queueFrame()
    }
  })
}

function shutdown() {
  closing = true
  return shutdownPromise ??= (async () => {
    await framePump
    await player.destroy()
  })()
}

player.setUpdateCallback(() => {updates++; queueFrame()})
player.setEventCallback(() => send({type: 'events', events: player.pollEvents()}))
frames.on('error', () => { void shutdown().finally(() => {if (process.connected) process.disconnect()}) })
process.on('message', async (message: {id: number; method: string; args: unknown[]}) => {
  const {id, method, args} = message
  try {
    if (method === 'destroy') {
      await shutdown()
      if (process.connected) process.disconnect()
      return
    }
    if (closing) throw new Error('Playback process is closing')
    if (method === 'renderFrame') {
      size = args as [number, number]
      frameRequests.push(id)
      queueFrame()
      return
    }
    const methods = new Set(['open', 'play', 'pause', 'stop', 'seek', 'setVolume', 'setRate'])
    if (!methods.has(method)) throw new Error(`Unknown native playback method: ${method}`)
    const result = (player[method as keyof typeof player] as (...args: unknown[]) => unknown).apply(player, args)
    send({type: 'reply', id, result})
  } catch (error) {
    send({type: 'reply', id, error: error instanceof Error ? error.message : String(error)})
  }
})
process.once('disconnect', () => { void shutdown() })
