import {fork} from 'node:child_process'
import path from 'node:path'
import type {Readable} from 'node:stream'
import type {NativeEvent, NativeFrame, NativeModule} from './mpv-service'

export function createMpvWorkerModule(addonPath: string): NativeModule {
  return {MpvPlayer: class {
    private child
    private nextId = 0
    private pending = new Map<number, {resolve(value: unknown): void; reject(error: Error): void}>()
    private events: NativeEvent[] = []
    private updateCallback: (() => void) | undefined
    private eventCallback: (() => void) | undefined
    private updatePending = false
    private failure: Error | undefined
    private destroying = false
    private exited: Promise<void>

    constructor(options?: {mode?: string}) {
      this.child = fork(path.join(path.dirname(addonPath), 'mpv-worker.js'), [addonPath, JSON.stringify(options ?? {})], {
        execPath: path.join(path.dirname(addonPath), 'node'),
        execArgv: [],
        // Electron and the build's Node runtime can use different V8 wire
        // versions. Controls use JSON; raw frames use a fixed byte format.
        serialization: 'json',
        stdio: ['ignore', 'pipe', 'pipe', 'ipc', 'pipe'],
        env: {...process.env, ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined},
      })
      this.child.stdout?.pipe(process.stdout)
      this.child.stderr?.pipe(process.stderr)
      const header = Buffer.alloc(16)
      let headerBytes = 0
      let payload: Buffer | null = null
      let payloadBytes = 0
      let frameId = 0, width = 0, height = 0
      ;(this.child.stdio[4] as Readable).on('data', (chunk: Buffer) => {
        let offset = 0
        while (offset < chunk.length) {
          if (!payload) {
            const count = Math.min(16 - headerBytes, chunk.length - offset)
            chunk.copy(header, headerBytes, offset, offset + count)
            headerBytes += count; offset += count
            if (headerBytes < 16) continue
            frameId = header.readUInt32LE(0); width = header.readUInt32LE(4); height = header.readUInt32LE(8)
            const length = header.readUInt32LE(12)
            if (width < 2 || height < 2 || width > 1920 || height > 1080 || length !== width * height * 4) {
              this.child.kill('SIGKILL')
              return
            }
            payload = Buffer.allocUnsafe(length)
            payloadBytes = 0
          }
          const count = Math.min(payload.length - payloadBytes, chunk.length - offset)
          chunk.copy(payload, payloadBytes, offset, offset + count)
          payloadBytes += count; offset += count
          if (payloadBytes === payload.length) {
            this.pending.get(frameId)?.resolve({width, height, rgba: payload})
            this.pending.delete(frameId)
            payload = null; headerBytes = 0
          }
        }
      })
      this.child.on('message', (message: {type: string; id?: number; result?: unknown; error?: string; events?: NativeEvent[]}) => {
        if (message.type === 'update') {
          this.updatePending = true
          if (this.updateCallback) { this.updatePending = false; this.updateCallback() }
        } else if (message.type === 'events') {
          this.events.push(...message.events!)
          this.eventCallback?.()
        } else if (message.type === 'reply') {
          const request = this.pending.get(message.id!)
          this.pending.delete(message.id!)
          if (message.error) request?.reject(new Error(message.error))
          else request?.resolve(message.result)
        }
      })
      const fail = (error: Error) => {
        this.failure = error
        for (const request of this.pending.values()) request.reject(error)
        this.pending.clear()
        if (!this.destroying) { this.events.push({id: -1, type: 'worker-error', error: error.message}); this.eventCallback?.() }
      }
      this.child.once('error', fail)
      this.exited = new Promise(resolve => this.child.once('close', (code, signal) => {
        fail(new Error(`Playback process exited (${signal ?? code})`))
        resolve()
      }))
    }

    private request(method: string, args: unknown[] = []): Promise<unknown> {
      if (this.failure) return Promise.reject(this.failure)
      const id = this.nextId = (this.nextId + 1) >>> 0
      return new Promise((resolve, reject) => {
        this.pending.set(id, {resolve, reject})
        this.child.send({id, method, args}, error => {
          if (error) { this.pending.delete(id); reject(error) }
        })
      })
    }
    private command(method: string, args: unknown[] = []) {
      void this.request(method, args).catch(error => {
        if (!this.destroying) { this.events.push({id: -1, type: 'command-error', error: String(error)}); this.eventCallback?.() }
      })
    }
    open(source: string) { this.command('open', [source]) }
    play() { this.command('play') }
    pause() { this.command('pause') }
    stop() { this.command('stop') }
    seek(value: number) { this.command('seek', [value]) }
    setVolume(value: number) { this.command('setVolume', [value]) }
    setRate(value: number) { this.command('setRate', [value]) }
    setUpdateCallback(callback?: () => void) {
      this.updateCallback = callback
      if (callback && this.updatePending) { this.updatePending = false; callback() }
    }
    setEventCallback(callback?: () => void) { this.eventCallback = callback; if (this.events.length) callback?.() }
    async renderFrame(width: number, height: number) { return await this.request('renderFrame', [width, height]) as NativeFrame }
    renderSharedTexture(): never { throw new Error('Linux uses software frames') }
    pollEvents() { return this.events.splice(0) }
    async destroy() {
      if (!this.destroying) {
        this.destroying = true
        this.updateCallback = undefined
        this.eventCallback = undefined
        if (this.child.connected) this.child.send({id: ++this.nextId, method: 'destroy', args: []})
      }
      const deadline = setTimeout(() => {
        if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL')
      }, 5000)
      deadline.unref()
      try { await this.exited } finally { clearTimeout(deadline) }
    }
  }}
}
