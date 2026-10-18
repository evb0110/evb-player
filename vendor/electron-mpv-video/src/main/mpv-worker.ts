// Runs in ordinary Node, isolating FFmpeg's ABI and allocator from Electron.
import {createRequire} from 'node:module'
import {createWriteStream} from 'node:fs'
import {once} from 'node:events'
import {setTimeout as waitForPresentation} from 'node:timers/promises'
import type {NativeFrame, NativeModule} from './mpv-service'

const native = createRequire(__filename)(process.argv[2]!) as NativeModule
const player = new native.MpvPlayer(JSON.parse(process.argv[3]!))
const frames = createWriteStream('', {fd: 4, autoClose: false})
const send = (message: unknown) => { if (process.connected) process.send?.(message) }
let size: [number, number] | undefined
let framePending = false, closing = false
let framePump: Promise<void> | undefined
let presentationPump: Promise<void> | undefined
let shutdownPromise: Promise<void> | undefined
const frameRequests: number[] = []
interface IPresentation {frame: NativeFrame; requests: number[]; at: number; generation: number}
const presentations: IPresentation[] = []
let generation = 0
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

function queuePresentation() {
  if (presentationPump || closing) return
  presentationPump = Promise.resolve().then(async () => {
    let active: IPresentation | undefined
    try {
      while (presentations.length && !closing) {
        active = presentations.shift()!
        const remaining = active.at - performance.now()
        if (remaining > 0) await waitForPresentation(remaining)
        if (closing) break
        // A seek or source change invalidates unsolicited images, but pending
        // viewport requests must still receive their matching-sized response.
        if (active.generation === generation || active.requests.length) {
          for (const id of active.requests.length ? active.requests : [0]) await writeFrame(id, active.frame)
        }
        active = undefined
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      for (const item of [...(active ? [active] : []), ...presentations.splice(0)]) {
        for (const id of item.requests) send({type: 'reply', id, error: message})
      }
      if (!closing) send({type: 'events', events: [{id: -1, type: 'render-error', error: message}]})
    } finally {
      presentationPump = undefined
      if (presentations.length && !closing) queuePresentation()
    }
  })
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
        // Capture immediately, independently of presentation waits and pipe
        // backpressure, so libmpv can acknowledge and queue its next frame.
        answering = frameRequests.splice(0)
        if (presentations.length >= 8) {
          const discard = presentations.findIndex(item => !item.requests.length)
          if (discard < 0) throw new Error('Too many pending playback viewport requests')
          presentations.splice(discard, 1)
        }
        presentations.push({frame, requests: answering, at: performance.now() + (frame.delayMs || 0), generation})
        answering = []
        queuePresentation()
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
    await presentationPump
    presentations.length = 0
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
    if (['open', 'pause', 'stop', 'seek', 'setRate'].includes(method)) {
      generation++
      for (let index = presentations.length - 1; index >= 0; index--) {
        if (!presentations[index]!.requests.length) presentations.splice(index, 1)
      }
    }
    const result = (player[method as keyof typeof player] as (...args: unknown[]) => unknown).apply(player, args)
    send({type: 'reply', id, result})
  } catch (error) {
    send({type: 'reply', id, error: error instanceof Error ? error.message : String(error)})
  }
})
process.once('disconnect', () => { void shutdown() })
