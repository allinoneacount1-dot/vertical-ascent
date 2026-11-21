// Serverless WebRTC P2P Multiplayer (Fase 5):
// Lazy-loads trystero (Nostr WebRTC signaling, zero backend/account) for cross-device play,
// paired with a same-origin BroadcastChannel mirror for instant multi-tab & local testing.
// Shares 15 Hz climber poses + deterministic roomEpoch so kinematic platforms stay in sync.
import type { HeroId } from '../character/heroes.ts'

const APP_ID = 'vertical-ascent-ghibli-v1'
const NAME_KEY = 'va.mp.name.v1'
const BROADCAST_INTERVAL_MS = 66 // ~15 Hz
const PEER_STALE_MS = 6000
const EMOTE_DURATION_MS = 3500
const EMOTE_COOLDOWN_MS = 700
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export type EmoteId = 'wave' | 'hype' | 'warn' | 'race'

export type EmoteSpec = { id: EmoteId; key: string; icon: string; label: string }

export const MP_EMOTES: readonly EmoteSpec[] = [
  { id: 'wave', key: '1', icon: '\u{1F44B}', label: 'Hi!' },
  { id: 'hype', key: '2', icon: '\u{1F525}', label: "Let's Go!" },
  { id: 'warn', key: '3', icon: '\u26A0\uFE0F', label: 'Watch Out!' },
  { id: 'race', key: '4', icon: '\u{1F3C6}', label: 'Wait Up!' },
]

export type EmotePacket = {
  id: string
  name: string
  emoteId: EmoteId
}

export type PosePacket = {
  id: string
  name: string
  heroId: HeroId
  x: number
  y: number
  z: number
  yaw: number
  heightM: number
  epoch: number
  seq: number
}

export type RemotePeerState = {
  id: string
  name: string
  heroId: HeroId
  x: number
  y: number
  z: number
  yaw: number
  heightM: number
  lastSeenMs: number
  lastSeq: number
  emote: string | null
  emoteUntilMs: number
}

export type RemotePeerHud = {
  id: string
  name: string
  heroId: HeroId
  heightM: number
}

export type MultiplayerUi = {
  roomCode: string | null
  playerName: string
  peerCount: number
  peers: RemotePeerHud[]
  transport: 'idle' | 'connecting' | 'connected'
}

type TrysteroRoom = {
  leave: () => void
  onPeerJoin: (cb: (peerId: string) => void) => void
  onPeerLeave: (cb: (peerId: string) => void) => void
  makeAction: <T>(name: string) => [(data: T, targetPeers?: string | string[] | null) => void, (cb: (data: T, peerId: string) => void) => void]
}

function makeClientId(): string {
  const arr = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function generateRoomCode(len = 6): string {
  let out = ''
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return out
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

export function readRoomCodeFromUrl(): string | null {
  try {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('room')
    if (!raw) return null
    const clean = normalizeRoomCode(raw)
    return clean.length >= 3 ? clean : null
  } catch {
    return null
  }
}

function syncRoomParamToUrl(code: string | null): void {
  try {
    if (typeof window === 'undefined' || !window.history?.replaceState) return
    const url = new URL(window.location.href)
    if (code) url.searchParams.set('room', code)
    else url.searchParams.delete('room')
    window.history.replaceState(null, '', url.toString())
  } catch {
    // ignore history errors in sandboxed iframes
  }
}

export function buildInviteUrl(code: string): string {
  try {
    if (typeof window === 'undefined') return `?room=${code}`
    const url = new URL(window.location.href)
    url.searchParams.set('room', code)
    return url.toString()
  } catch {
    return `?room=${code}`
  }
}

function loadPlayerName(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(NAME_KEY)?.trim()
      if (saved) return saved.slice(0, 16)
    }
  } catch {
    // ignore storage errors
  }
  return `Climber-${Math.floor(100 + Math.random() * 900)}`
}

function savePlayerName(name: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(NAME_KEY, name)
  } catch {
    // ignore storage errors
  }
}

export class MultiplayerSystem {
  readonly selfId: string = makeClientId()
  roomCode: string | null = null
  playerName: string = loadPlayerName()
  roomEpoch = 0
  transport: 'idle' | 'connecting' | 'connected' = 'idle'
  readonly peers = new Map<string, RemotePeerState>()

  private trysteroRoom: TrysteroRoom | null = null
  private sendRtcPose: ((pkt: PosePacket) => void) | null = null
  private sendRtcBye: ((id: string) => void) | null = null
  private sendRtcEmote: ((pkt: EmotePacket) => void) | null = null
  private bc: BroadcastChannel | null = null
  private seq = 0
  private lastBroadcastMs = 0
  private lastEmoteMs = 0
  lastEmoteEvent: { from: string; emoteId: EmoteId } | null = null
  private lastUiSyncMs = 0
  private uiDirty = false
  private onUiChange: (ui: MultiplayerUi) => void
  private onEpochSync: (epochMs: number) => void
  private onToast: (text: string) => void
  private onEmote?: () => void

  constructor(opts: {
    onUiChange: (ui: MultiplayerUi) => void
    onEpochSync: (epochMs: number) => void
    onToast: (text: string) => void
    onEmote?: () => void
  }) {
    this.onUiChange = opts.onUiChange
    this.onEpochSync = opts.onEpochSync
    this.onToast = opts.onToast
    this.onEmote = opts.onEmote
  }

  setPlayerName(raw: string): void {
    const clean = raw.trim().slice(0, 16) || this.playerName
    this.playerName = clean
    savePlayerName(clean)
    this.emitUi()
  }

  createRoom(): string {
    const code = generateRoomCode(6)
    void this.joinRoom(code)
    return code
  }

  async joinRoom(rawCode: string): Promise<boolean> {
    const code = normalizeRoomCode(rawCode)
    if (code.length < 3) return false
    if (this.roomCode === code) return true
    this.leaveRoom(false)

    this.roomCode = code
    this.roomEpoch = Date.now()
    this.transport = 'connecting'
    this.seq = 0
    syncRoomParamToUrl(code)
    this.emitUi()

    // 1. Same-origin BroadcastChannel mirror (instant multi-tab & headless E2E sync)
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel(`va-mp-room-${code}`)
        ch.onmessage = (ev: MessageEvent) => {
          const msg = ev.data as { type?: string; pose?: PosePacket; emote?: EmotePacket; id?: string } | null
          if (!msg) return
          if (msg.type === 'pose' && msg.pose) this.handleIncomingPose(msg.pose)
          else if (msg.type === 'emote' && msg.emote) this.handleIncomingEmote(msg.emote)
          else if (msg.type === 'bye' && msg.id) this.removePeer(msg.id)
        }
        this.bc = ch
      }
    } catch {
      // BroadcastChannel unavailable
    }

    // 2. Lazy-load serverless WebRTC P2P (trystero / Nostr relays) for cross-device internet play
    try {
      const mod = await import('trystero')
      // Guard in case leaveRoom() or another joinRoom() ran while loading
      if (this.roomCode !== code) return false
      const room = mod.joinRoom({ appId: APP_ID }, `va-room-${code}`) as unknown as TrysteroRoom
      const [sendPose, getPose] = room.makeAction<PosePacket>('pose')
      const [sendBye, getBye] = room.makeAction<string>('bye')
      const [sendEmoteAct, getEmoteAct] = room.makeAction<EmotePacket>('emote')
      getPose((pkt) => this.handleIncomingPose(pkt))
      getBye((id) => this.removePeer(id))
      getEmoteAct((pkt) => this.handleIncomingEmote(pkt))
      room.onPeerLeave((rtcPeerId) => {
        // Fallback cleanup if peer disconnected abruptly without bye packet
        this.removePeer(rtcPeerId)
      })
      this.trysteroRoom = room
      this.sendRtcPose = (pkt) => {
        try {
          sendPose(pkt)
        } catch {
          // ignore transient datachannel send errors
        }
      }
      this.sendRtcBye = (id) => {
        try {
          sendBye(id)
        } catch {
          // ignore
        }
      }
      this.sendRtcEmote = (pkt) => {
        try {
          sendEmoteAct(pkt)
        } catch {
          // ignore
        }
      }
      this.transport = 'connected'
      this.emitUi()
    } catch {
      // Even if external Nostr relays are unreachable offline, BroadcastChannel remains active
      if (this.roomCode === code) {
        this.transport = 'connected'
        this.emitUi()
      }
    }

    this.onToast(`Room ${code} aktif`)
    return true
  }

  leaveRoom(clearUrl = true): void {
    const prev = this.roomCode
    if (prev != null) {
      try {
        this.bc?.postMessage({ type: 'bye', id: this.selfId })
      } catch {
        // ignore
      }
      this.sendRtcBye?.(this.selfId)
    }
    try {
      this.trysteroRoom?.leave()
    } catch {
      // ignore
    }
    try {
      this.bc?.close()
    } catch {
      // ignore
    }
    this.trysteroRoom = null
    this.sendRtcPose = null
    this.sendRtcBye = null
    this.sendRtcEmote = null
    this.bc = null
    this.roomCode = null
    this.roomEpoch = 0
    this.transport = 'idle'
    this.peers.clear()
    if (clearUrl) syncRoomParamToUrl(null)
    this.emitUi()
    if (prev != null && clearUrl) this.onToast(`Keluar dari Room ${prev}`)
  }

  private handleIncomingPose(pkt: PosePacket): void {
    if (!pkt || pkt.id === this.selfId || typeof pkt.x !== 'number') return
    const now = performance.now()
    const existing = this.peers.get(pkt.id)
    if (existing && pkt.seq <= existing.lastSeq && now - existing.lastSeenMs < 2000) return

    const isNew = existing == null
    const roundedH = Math.max(0, Math.round(pkt.heightM))
    if (existing) {
      if (existing.heightM !== roundedH || existing.heroId !== pkt.heroId || existing.name !== pkt.name) {
        this.uiDirty = true
      }
      existing.name = pkt.name
      existing.heroId = pkt.heroId
      existing.x = pkt.x
      existing.y = pkt.y
      existing.z = pkt.z
      existing.yaw = pkt.yaw
      existing.heightM = roundedH
      existing.lastSeenMs = now
      existing.lastSeq = pkt.seq
    } else {
      this.peers.set(pkt.id, {
        id: pkt.id,
        name: pkt.name,
        heroId: pkt.heroId,
        x: pkt.x,
        y: pkt.y,
        z: pkt.z,
        yaw: pkt.yaw,
        heightM: roundedH,
        lastSeenMs: now,
        lastSeq: pkt.seq,
        emote: null,
        emoteUntilMs: 0,
      })
      this.uiDirty = true
    }

    // Deterministic roomEpoch adoption (earliest peer timestamp wins)
    if (pkt.epoch > 0 && (this.roomEpoch === 0 || pkt.epoch < this.roomEpoch)) {
      this.roomEpoch = pkt.epoch
      this.onEpochSync(this.roomEpoch)
    }

    if (isNew) {
      this.onToast(`${pkt.name} bergabung ke room`)
      this.emitUi()
    }
  }

  sendEmote(emoteId: EmoteId): boolean {
    if (this.roomCode == null) return false
    const now = performance.now()
    if (now - this.lastEmoteMs < EMOTE_COOLDOWN_MS) return false
    const spec = MP_EMOTES.find((e) => e.id === emoteId)
    if (!spec) return false
    this.lastEmoteMs = now
    const pkt: EmotePacket = { id: this.selfId, name: this.playerName, emoteId }
    try {
      this.bc?.postMessage({ type: 'emote', emote: pkt })
    } catch {
      // ignore
    }
    this.sendRtcEmote?.(pkt)
    this.lastEmoteEvent = { from: this.playerName, emoteId }
    this.onEmote?.()
    this.onToast(`${this.playerName}: ${spec.icon} ${spec.label}`)
    return true
  }

  private handleIncomingEmote(pkt: EmotePacket): void {
    if (!pkt || pkt.id === this.selfId) return
    const spec = MP_EMOTES.find((e) => e.id === pkt.emoteId)
    if (!spec) return
    const peer = this.peers.get(pkt.id)
    if (peer) {
      peer.emote = spec.icon
      peer.emoteUntilMs = performance.now() + EMOTE_DURATION_MS
    }
    this.lastEmoteEvent = { from: pkt.name, emoteId: pkt.emoteId }
    this.onEmote?.()
    this.onToast(`${pkt.name}: ${spec.icon} ${spec.label}`)
  }

  private removePeer(id: string): void {
    const peer = this.peers.get(id)
    if (!peer) return
    this.peers.delete(id)
    this.onToast(`${peer.name} keluar dari room`)
    this.emitUi()
  }

  /** Called from the main frame loop; broadcasts local pose at ~15 Hz and prunes stale peers. */
  tick(nowMs: number, heroId: HeroId, x: number, y: number, z: number, yaw: number, heightM: number): void {
    if (this.roomCode == null) return

    // Prune disconnected peers
    let pruned = false
    for (const [id, p] of this.peers) {
      if (nowMs - p.lastSeenMs > PEER_STALE_MS) {
        this.peers.delete(id)
        pruned = true
      }
    }
    if (pruned) this.uiDirty = true

    // Broadcast local pose at ~15 Hz
    if (nowMs - this.lastBroadcastMs >= BROADCAST_INTERVAL_MS) {
      this.lastBroadcastMs = nowMs
      const pkt: PosePacket = {
        id: this.selfId,
        name: this.playerName,
        heroId,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        z: Math.round(z * 100) / 100,
        yaw: Math.round(yaw * 1000) / 1000,
        heightM: Math.max(0, Math.round(heightM)),
        epoch: this.roomEpoch,
        seq: ++this.seq,
      }
      try {
        this.bc?.postMessage({ type: 'pose', pose: pkt })
      } catch {
        // ignore
      }
      this.sendRtcPose?.(pkt)
    }

    // Throttled HUD sync (~4 Hz) when peer heights change
    if (this.uiDirty && nowMs - this.lastUiSyncMs >= 250) {
      this.lastUiSyncMs = nowMs
      this.uiDirty = false
      this.emitUi()
    }
  }

  getUiState(): MultiplayerUi {
    const list: RemotePeerHud[] = []
    for (const p of this.peers.values()) {
      list.push({ id: p.id, name: p.name, heroId: p.heroId, heightM: p.heightM })
    }
    list.sort((a, b) => b.heightM - a.heightM)
    return {
      roomCode: this.roomCode,
      playerName: this.playerName,
      peerCount: this.peers.size,
      peers: list,
      transport: this.transport,
    }
  }

  snapshot() {
    const peers: Array<{ id: string; name: string; heroId: HeroId; pos: [number, number, number]; heightM: number }> = []
    for (const p of this.peers.values()) {
      peers.push({ id: p.id, name: p.name, heroId: p.heroId, pos: [p.x, p.y, p.z], heightM: p.heightM })
    }
    return {
      selfId: this.selfId,
      roomCode: this.roomCode,
      playerName: this.playerName,
      roomEpoch: this.roomEpoch,
      transport: this.transport,
      peerCount: this.peers.size,
      lastEmoteEvent: this.lastEmoteEvent,
      peers,
    }
  }

  private emitUi(): void {
    this.onUiChange(this.getUiState())
  }
}
