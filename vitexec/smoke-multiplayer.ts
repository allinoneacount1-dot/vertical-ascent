// TEST-48: E2E smoke test for Fase 5 Multiplayer WebRTC P2P Room + Link Share (?room=KODE)
import { game as liveGame } from '/src/game/game.ts'
import { buildInviteUrl, readRoomCodeFromUrl } from '/src/game/multiplayer.ts'
import { bootToPlaying, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 6; i++) await nextFrame()

// 1. Create room and verify ?room=CODE URL sync + invite link
const code = liveGame.multiplayer.createRoom()
await sleep(300)
const urlCode = readRoomCodeFromUrl()
const inviteUrl = buildInviteUrl(code)
out.room = { code, urlCode, inviteUrl, transport: liveGame.multiplayer.transport }
if (!code || code.length !== 6) failures.push(`Expected 6-char room code, got ${code}`)
if (urlCode !== code) failures.push(`URL ?room= mismatch: expected ${code}, got ${urlCode}`)
if (!inviteUrl.includes(`room=${code}`)) failures.push(`Invite URL missing room param: ${inviteUrl}`)

// 2. Simulate remote peer in same room via BroadcastChannel with earlier roomEpoch
const remoteEpoch = Date.now() - 45_000
const ch = new BroadcastChannel(`va-mp-room-${code}`)
ch.postMessage({
  type: 'pose',
  pose: {
    id: 'peer-taro-01',
    name: 'Taro',
    heroId: 'kaze',
    x: 2.5,
    y: 42.0,
    z: -1.5,
    yaw: 1.2,
    heightM: 42,
    epoch: remoteEpoch,
    seq: 1,
  },
})

await sleep(400)
for (let i = 0; i < 8; i++) await nextFrame()

const snap = liveGame.multiplayer.snapshot()
const hudBadge = document.querySelector('[data-testid="hud-mp-badge"]')?.textContent?.trim() ?? null
const peerDots = document.querySelectorAll('[data-testid="elev-peer-dot"]').length
out.sync = {
  peerCount: snap.peerCount,
  peers: snap.peers,
  roomEpoch: snap.roomEpoch,
  adoptedEarlierEpoch: snap.roomEpoch === remoteEpoch,
  hudBadge,
  peerDots,
}

if (snap.peerCount !== 1) failures.push(`Expected 1 remote peer, got ${snap.peerCount}`)
if (snap.peers[0]?.name !== 'Taro' || snap.peers[0]?.heroId !== 'kaze' || snap.peers[0]?.heightM !== 42) {
  failures.push(`Remote peer mismatch: ${JSON.stringify(snap.peers[0])}`)
}
if (snap.roomEpoch !== remoteEpoch) failures.push(`roomEpoch not synced to earlier peer: ${snap.roomEpoch} vs ${remoteEpoch}`)
if (!hudBadge || !hudBadge.includes(code) || !hudBadge.includes('2P')) {
  failures.push(`HUD multiplayer badge invalid: ${hudBadge}`)
}
if (peerDots !== 1) failures.push(`Expected 1 elevation peer dot, got ${peerDots}`)

// 2b. Verify Quick Emote broadcast & remote emote reception
const selfSent = liveGame.multiplayer.sendEmote('wave')
ch.postMessage({ type: 'emote', emote: { id: 'peer-taro-01', name: 'Taro', emoteId: 'hype' } })
await sleep(250)
const emoteState = liveGame.multiplayer.snapshot().lastEmoteEvent
const emoteHint = document.querySelector('[data-testid="hud-mp-emotes"]')?.textContent?.trim() ?? null
out.emotes = { selfSent, emoteState, emoteHint }
if (!selfSent) failures.push('Expected sendEmote(wave) to return true')
if (emoteState?.from !== 'Taro' || emoteState?.emoteId !== 'hype') {
  failures.push(`Remote emote mismatch: ${JSON.stringify(emoteState)}`)
}
if (!emoteHint) failures.push('Missing HUD multiplayer emote hint')

// 3. Peer disconnects ('bye') and local player leaves room
ch.postMessage({ type: 'bye', id: 'peer-taro-01' })
await sleep(250)
const afterBye = liveGame.multiplayer.snapshot().peerCount
ch.close()

liveGame.multiplayer.leaveRoom(true)
const afterLeaveUrl = readRoomCodeFromUrl()
out.cleanup = { afterBye, afterLeaveUrl, roomCode: liveGame.multiplayer.roomCode }
if (afterBye !== 0) failures.push(`Expected 0 peers after bye, got ${afterBye}`)
if (afterLeaveUrl !== null || liveGame.multiplayer.roomCode !== null) {
  failures.push(`leaveRoom failed to clear room/URL: ${afterLeaveUrl}`)
}

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-48-multiplayer-p2p', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-48 FAILED: ${failures.join('; ')}`)
