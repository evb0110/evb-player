import {fork} from 'node:child_process'
import path from 'node:path'
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
        serialization: 'advanced',
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: {...process.env, ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined},
      })
      this.child.stdout?.pipe(process.stdout)
      this.child.stderr?.pipe(process.stderr)
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
      const id = ++this.nextId
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
      await this.exited
    }
  }}
}
