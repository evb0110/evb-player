// Runs in the bundled, ordinary Node executable, never in Electron. Keeping
// FFmpeg in this process avoids both ABI and allocator symbol interposition.
import {createRequire} from 'node:module'
import {createWriteStream} from 'node:fs'
import {once} from 'node:events'
import type {NativeModule} from './mpv-service'

const requireNative = createRequire(__filename)
const native = requireNative(process.argv[2]!) as NativeModule
const player = new native.MpvPlayer(JSON.parse(process.argv[3]!))
const frames = createWriteStream('', {fd: 4, autoClose: false})
const send = (message: unknown) => { if (process.connected) process.send?.(message) }
player.setUpdateCallback(() => send({type: 'update'}))
player.setEventCallback(() => send({type: 'events', events: player.pollEvents()}))
process.on('message', async (message: {id: number; method: string; args: unknown[]}) => {
  const {id, method, args} = message
  try {
    if (method === 'destroy') {
      await player.destroy()
      process.disconnect()
      return
    }
    const methods = new Set(['open', 'play', 'pause', 'stop', 'seek', 'setVolume', 'setRate', 'renderFrame'])
    if (!methods.has(method)) throw new Error(`Unknown native playback method: ${method}`)
    const result = (player[method as keyof typeof player] as (...args: unknown[]) => unknown).apply(player, args)
    if (method === 'renderFrame') {
      const frame = result as import('./mpv-service').NativeFrame
      const header = Buffer.alloc(16)
      header.writeUInt32LE(id, 0)
      header.writeUInt32LE(frame.width, 4)
      header.writeUInt32LE(frame.height, 8)
      header.writeUInt32LE(frame.rgba.byteLength, 12)
      frames.write(header)
      if (!frames.write(frame.rgba)) await once(frames, 'drain')
      return
    }
    send({type: 'reply', id, result})
  } catch (error) {
    send({type: 'reply', id, error: error instanceof Error ? error.message : String(error)})
  }
})
process.once('disconnect', () => { void player.destroy() })
