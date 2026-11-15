import { useState, useEffect, useCallback, useRef } from 'react'
import {
  createState, resolveScene, visibleChoices,
  choose, fallbackScene, provideGeneratedScene, setSpice as engineSetSpice, currentAct,
  dropItem as engineDropItem, useItem as engineUseItem, resolveItemUse,
  acceptInventoryOffer, declineInventoryOffer,
} from '../../src/engine/engine.js'
import { renderPortraitSVG, renderGestureSVG, renderMouthOpenSVG } from '../../src/portrait/render.js'
import { renderItemSVG } from '../../src/portrait/item-render.js'
import layers from '../../src/portrait/layers.json'
import itemLayers from '../../src/portrait/item-layers.json'
import lakeSparkleCast from '../../cast/lake-sparkle.json'
import briarwoodCast from '../../cast/briarwood.json'
import lakewoodCast from '../../cast/lakewood.json'

const _adventureMods = import.meta.glob('../../adventures/*.json', { eager: true })
const ADVENTURES = Object.values(_adventureMods).map(m => m.default)
const CASTS = { 'lake-sparkle': lakeSparkleCast, briarwood: briarwoodCast, lakewood: lakewoodCast }
const SAVE_KEY = 'lsa'
const AUTH_KEY  = 'lsa-auth'
const ADVENTURE_IMAGES = { toast: '/toast.webp', passions: '/wedding.webp' }

const C = {
  bg: '#170a21',
  panel: '#24112f',
  pink: '#ff6fb1',
  gold: '#ffd54a',
  teal: '#5ee6d6',
  green: '#7dff9b',
  cream: '#f6ead8',
  lavender: '#c9b3d6',
  dim: '#3a1a4d',
}

const scanlines = `repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0px,rgba(255,255,255,.025) 1px,transparent 1px,transparent 4px),${C.bg}`
const press = "'Press Start 2P', monospace"
const vt = "'VT323', monospace"

// ── sub-components ───────────────────────────────────────────────────────────

function LoginModal({ onSuccess }) {
  const [name, setName]         = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [busy, setBusy]         = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    const authHeader = 'Basic ' + btoa(`${name.trim()}:${password}`)
    try {
      const res = await fetch('/api/ping', { headers: { Authorization: authHeader } })
      if (res.ok) {
        onSuccess({ name: name.trim(), authHeader })
      } else {
        setError('Wrong password, darling.')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,10,33,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '0 16px' }}>
      <div style={{ background: C.panel, border: `3px solid ${C.gold}`, padding: '24px 20px', width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: press, fontSize: 10, color: C.gold, lineHeight: 1.8 }}>WHO ARE YOU?</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Your housewife name"
            autoFocus
            style={{ background: C.dim, border: `2px solid ${C.pink}`, color: C.cream, fontFamily: vt, fontSize: 22, padding: '10px 12px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            style={{ background: C.dim, border: `2px solid ${C.lavender}`, color: C.cream, fontFamily: vt, fontSize: 22, padding: '10px 12px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          {error && <div style={{ fontFamily: press, fontSize: 8, color: C.pink }}>{error}</div>}
          <button type="submit" disabled={busy || !name.trim()}
            style={{ background: C.pink, color: C.bg, fontFamily: press, fontSize: 10, padding: '14px', border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, minHeight: 44 }}>
            {busy ? 'CHECKING…' : 'ENTER THE VILLA'}
          </button>
        </form>
      </div>
    </div>
  )
}


function Portrait({ look, mood, fx, name }) {
  const svg = renderPortraitSVG(layers, look, { mood, fx, size: 128, label: name })
  return (
    <div
      style={{ width: 136, height: 136, border: `4px solid ${C.pink}`, background: C.dim, boxShadow: `4px 4px 0 ${C.bg}`, flexShrink: 0, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function ConfessionalPortrait({ look, mood, name }) {
  const [gestureKey, setGestureKey] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setGestureKey(k => k + 1), 500)
    return () => clearTimeout(t)
  }, [name])

  const svg      = renderPortraitSVG(layers, look, { mood, size: 80, label: name, confessional: true })
  const mouthSvg = renderMouthOpenSVG(layers, look, 80)
  const gesture  = renderGestureSVG(layers, look, 80)
  return (
    <div style={{ position: 'relative', width: 88, height: 88, border: `3px solid ${C.teal}`, background: C.dim, flexShrink: 0, overflow: 'hidden' }}>
      <div className="conf-talk" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="conf-mouth" dangerouslySetInnerHTML={{ __html: mouthSvg }} />
      <div key={gestureKey} className="conf-gesture" dangerouslySetInnerHTML={{ __html: gesture }} />
    </div>
  )
}

const BAR_COLORS = [C.pink, C.teal]

function StatsRow({ stats, adventure }) {
  let barIdx = 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
      {Object.entries(adventure.stats).map(([key, def]) => {
        const val = stats[key]
        if (def.display === 'bar') {
          const color = BAR_COLORS[barIdx++ % BAR_COLORS.length]
          const pct = `${Math.round((val / (def.max ?? 100)) * 100)}%`
          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, color: C.lavender, marginBottom: 4 }}>
                <span>{def.label.toUpperCase()}</span><span>{val}</span>
              </div>
              <div style={{ height: 10, background: C.dim, border: `2px solid ${color}` }}>
                <div style={{ height: '100%', background: color, width: pct, transition: 'width .3s' }} />
              </div>
            </div>
          )
        }
        if (def.display === 'number') return (
          <div key={key}>
            <div style={{ fontSize: 19, color: C.lavender, marginBottom: 4 }}>{def.label.toUpperCase()}</div>
            <div style={{ fontFamily: press, fontSize: 15, color: C.gold }}>{val}</div>
          </div>
        )
        if (def.display === 'money') return (
          <div key={key}>
            <div style={{ fontSize: 19, color: C.lavender, marginBottom: 4 }}>{def.label.toUpperCase()}</div>
            <div style={{ fontFamily: press, fontSize: 13, color: C.green }}>${val.toLocaleString()}</div>
          </div>
        )
        return null
      })}
    </div>
  )
}

function TypedText({ text, speed = 55, style }) {
  const words = (text ?? '').split(' ').filter(Boolean)
  const [n, setN] = useState(0)
  useEffect(() => { setN(0) }, [text])
  useEffect(() => {
    if (n >= words.length) return
    const t = setTimeout(() => setN(i => i + 1), speed)
    return () => clearTimeout(t)
  })
  const done = n >= words.length
  return (
    <span style={style}>
      {words.slice(0, n).join(' ')}
      {!done && <span className="typing-cursor" aria-hidden="true">▌</span>}
    </span>
  )
}

function EpisodeSelect({ onSelect, onNewGame, spice, onSpice }) {
  const [shakingBtn, setShakingBtn] = useState(null)
  const handleSpice = (level) => {
    onSpice(level)
    setShakingBtn(level)
    setTimeout(() => setShakingBtn(null), 450)
  }
  return (
    <div style={{ background: scanlines, minHeight: '100dvh', padding: '32px 16px max(32px, env(safe-area-inset-bottom, 32px))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, alignSelf: 'flex-start', width: '100%' }}>
        <img src="/icon-512.png" alt="" aria-hidden="true" style={{ height: 72, width: 72, imageRendering: 'pixelated', flexShrink: 0 }} />
        <img src="/title.png" alt="Real You-wives" style={{ flex: 1, minWidth: 0, imageRendering: 'pixelated' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 18, color: C.lavender, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
        <span style={{ fontFamily: press, fontSize: 8 }}>SPICE:</span>
        {[1, 2, 3].map(level => (
          <button
            key={level}
            className={`spice-btn${shakingBtn === level ? ' unhinged-anim' : ''}`}
            onClick={() => handleSpice(level)}
            style={{
              fontFamily: vt, fontSize: 18,
              padding: '0 10px', minHeight: 44, minWidth: 44,
              background: spice === level ? C.pink : C.dim,
              color: spice === level ? C.bg : C.lavender,
              border: `2px solid ${C.pink}`,
            }}
          >
            {level === 1 ? 'COZY' : level === 2 ? 'PETTY' : 'UNHINGED'}
          </button>
        ))}
      </div>
      <div style={{ fontFamily: press, fontSize: 9, color: C.lavender, alignSelf: 'flex-start' }}>SELECT EPISODE</div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ADVENTURES.map((adv, i) => {
          const hasSave = !!localStorage.getItem(`${SAVE_KEY}-${adv.id}`)
          const castName = (CASTS[adv.cast]?.name ?? '').toUpperCase()
          const tease = adv.tone ? adv.tone.split('. ').slice(0, 2).join('. ') + '.' : ''
          const epBadge = adv.season && adv.episodeNumber
            ? `S${adv.season} · EP ${adv.episodeNumber}`
            : adv.label
          return (
            <div key={adv.id} style={{ background: C.panel, border: `3px solid ${C.gold}`, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div className="adv-card-body">
                {ADVENTURE_IMAGES[adv.id] && (
                  <img src={ADVENTURE_IMAGES[adv.id]} alt="" aria-hidden="true" className="adv-card-img" />
                )}
                <div className="adv-card-text">
                  <div style={{ fontFamily: press, fontSize: 8, color: C.pink }}>{epBadge}</div>
                  <div style={{ fontSize: 18, color: C.lavender }}>{castName}</div>
                  <div style={{ fontSize: 20, color: C.gold, lineHeight: 1.3 }}>{adv.episode}</div>
                  <div style={{ fontSize: 18, color: C.cream, lineHeight: 1.3 }}>{tease}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="ep-btn" onClick={() => onSelect(i)}
                  style={{ flex: 1, fontFamily: press, fontSize: 10, padding: '12px 10px', minHeight: 44, background: C.pink, color: C.bg, border: `2px solid ${C.pink}`, cursor: 'pointer' }}>
                  {hasSave ? 'CONTINUE ▶' : 'PLAY'}
                </button>
                {hasSave && (
                  <button className="ep-btn" onClick={() => onNewGame(i)}
                    style={{ fontFamily: press, fontSize: 9, padding: '12px 10px', minHeight: 44, background: C.dim, color: C.lavender, border: `2px solid ${C.lavender}`, cursor: 'pointer' }}>
                    NEW GAME
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function normalizeInventoryItem(item, adventure) {
  if (typeof item !== 'string') return item
  const def = adventure.items?.[item]
  return def
    ? { id: item, label: def.label, description: def.description ?? null, hint: def.hint ?? null, sprite: def.sprite ?? null }
    : { label: item, sprite: null }
}

function ItemSprite({ sprite, size = 32, label = '' }) {
  if (!sprite) {
    return (
      <div style={{ width: size, height: size, background: C.dim, border: `2px solid ${C.lavender}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: press, fontSize: 7, color: C.lavender }}>?</span>
      </div>
    )
  }
  const svg = renderItemSVG(itemLayers, sprite, { size, label })
  return <div style={{ lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
}

function InventoryScreen({ inventory, adventure, onDrop, onUse, onBack }) {
  const [selected, setSelected] = useState(null)
  const items = inventory.map(i => normalizeInventoryItem(i, adventure))

  const cells = Array.from({ length: Math.max(items.length, 6) }, (_, i) => items[i] ?? null)
  const sel = selected !== null ? items[selected] : null

  return (
    <div style={{ background: scanlines, minHeight: '100dvh', padding: '20px 16px max(20px, env(safe-area-inset-bottom, 20px))', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 600, margin: '0 auto' }}>

      {/* ── heading ── */}
      <div style={{ fontFamily: press, fontSize: 11, color: C.gold, borderBottom: `4px double ${C.gold}`, paddingBottom: 12, letterSpacing: 2 }}>
        ══ INVENTORY
      </div>

      {/* ── grid ── */}
      {items.length === 0 ? (
        <div style={{ background: C.panel, border: `3px solid ${C.dim}`, padding: '32px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: press, fontSize: 9, color: C.lavender, lineHeight: 1.8 }}>YOUR HANDS ARE{'\n'}SUSPICIOUSLY EMPTY.</div>
          <div style={{ fontSize: 20, color: C.dim }}>Producers suggest you pick something up.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {cells.map((item, i) => {
            const isSelected = selected === i && item !== null
            return (
              <button key={i} onClick={() => item && setSelected(isSelected ? null : i)}
                style={{
                  background: C.panel,
                  border: `2px solid ${isSelected ? C.pink : item ? C.gold : C.dim}`,
                  padding: 10,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  cursor: item ? 'pointer' : 'default',
                  minHeight: 90,
                  transition: 'border-color .1s',
                }}>
                {item ? (
                  <>
                    <ItemSprite sprite={item.sprite} size={48} label={item.label} />
                    <span style={{ fontFamily: vt, fontSize: 15, color: C.cream, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word' }}>
                      {item.label.length > 18 ? item.label.slice(0, 16) + '…' : item.label}
                    </span>
                  </>
                ) : (
                  <span style={{ fontFamily: press, fontSize: 8, color: C.dim }}>---</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── detail panel ── */}
      <div style={{ background: C.panel, border: `2px solid ${C.gold}`, padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {sel ? (
          <>
            <div style={{ fontFamily: press, fontSize: 9, color: C.gold, letterSpacing: 1 }}>{sel.label.toUpperCase()}</div>
            {sel.description && <div style={{ fontSize: 20, color: C.cream, lineHeight: 1.3 }}>{sel.description}</div>}
            {sel.hint && (
              <div style={{ fontSize: 18, color: C.pink, marginTop: 4 }}>! {sel.hint}</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 20, color: C.dim }}>Select an item.</div>
        )}
      </div>

      {/* ── actions ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => { if (sel) onUse(sel) }}
          disabled={!sel}
          style={{
            flex: 1, fontFamily: press, fontSize: 9, padding: '14px 8px', minHeight: 48,
            background: sel ? C.teal : C.bg,
            color: sel ? C.bg : C.dim,
            border: `3px solid ${sel ? C.teal : C.dim}`,
            cursor: sel ? 'pointer' : 'default',
          }}>
          USE ITEM
        </button>
        <button
          onClick={() => { if (sel) { onDrop(sel); setSelected(null) } }}
          disabled={!sel}
          style={{
            flex: 1, fontFamily: press, fontSize: 9, padding: '14px 8px', minHeight: 48,
            background: sel ? C.dim : C.bg,
            color: sel ? C.pink : C.dim,
            border: `3px solid ${sel ? C.pink : C.dim}`,
            cursor: sel ? 'pointer' : 'default',
          }}>
          DROP ITEM
        </button>
        <button onClick={onBack}
          style={{ flex: 1, fontFamily: press, fontSize: 9, padding: '14px 8px', minHeight: 48, background: C.dim, color: C.gold, border: `3px solid ${C.gold}`, cursor: 'pointer' }}>
          ◄ BACK
        </button>
      </div>

    </div>
  )
}

function SwapPrompt({ offeredItem, inventory, adventure, onAccept, onDecline }) {
  const items = inventory.map(i => normalizeInventoryItem(i, adventure))
  return (
    <div style={{ background: scanlines, minHeight: '100dvh', padding: '20px 16px max(20px, env(safe-area-inset-bottom, 20px))', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 600, margin: '0 auto' }}>

      <div style={{ fontFamily: press, fontSize: 10, color: C.pink, borderBottom: `4px double ${C.pink}`, paddingBottom: 12 }}>
        !! BAG IS FULL
      </div>

      {/* offered item */}
      <div style={{ background: C.panel, border: `3px solid ${C.teal}`, padding: '14px', display: 'flex', gap: 14, alignItems: 'center' }}>
        <ItemSprite sprite={offeredItem.sprite} size={48} label={offeredItem.label} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: press, fontSize: 8, color: C.teal, marginBottom: 6 }}>NEW ITEM</div>
          <div style={{ fontSize: 20, color: C.cream }}>{offeredItem.label}</div>
        </div>
      </div>

      <div style={{ fontFamily: press, fontSize: 8, color: C.lavender, lineHeight: 1.8 }}>
        DROP SOMETHING TO MAKE ROOM, OR LEAVE IT.
      </div>

      {/* current inventory — tap to drop and swap */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {items.map((item, i) => (
          <button key={i} onClick={() => onAccept(item.id ?? item.label)}
            style={{
              background: C.panel, border: `2px solid ${C.pink}`,
              padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              cursor: 'pointer', minHeight: 90,
            }}>
            <ItemSprite sprite={item.sprite} size={40} label={item.label} />
            <span style={{ fontFamily: press, fontSize: 7, color: C.pink }}>DROP</span>
            <span style={{ fontFamily: vt, fontSize: 13, color: C.cream, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word' }}>
              {item.label.length > 14 ? item.label.slice(0, 12) + '…' : item.label}
            </span>
          </button>
        ))}
      </div>

      <button onClick={onDecline}
        style={{ fontFamily: press, fontSize: 10, padding: '14px', minHeight: 48, background: C.dim, color: C.lavender, border: `3px solid ${C.lavender}`, cursor: 'pointer', width: '100%' }}>
        LEAVE IT
      </button>

    </div>
  )
}

function EndingScreen({ ending, adventure, onRestart, onGoToSelect }) {
  return (
    <div style={{ background: scanlines, minHeight: '100dvh', padding: '24px 16px max(24px, env(safe-area-inset-bottom, 24px))', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontFamily: press, fontSize: 13, color: C.pink, lineHeight: 1.8, fontWeight: 400 }}>
        REAL YOU-WIVES
      </h1>
      <div style={{ background: C.panel, border: `3px solid ${C.gold}`, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontFamily: press, fontSize: 10, color: C.gold, lineHeight: 1.8 }}>EPISODE OVER</div>
        <div style={{ fontFamily: press, fontSize: 15, color: C.pink, lineHeight: 1.8 }}>{ending.title}</div>
        <div style={{ fontSize: 24, lineHeight: 1.4 }}>{ending.text}</div>
        {ending.recap.length > 0 && (
          <>
            <div style={{ fontFamily: press, fontSize: 10, color: C.lavender, marginTop: 6 }}>YOUR STORY</div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ending.recap.map((line, i) => (
                <li key={i} style={{ fontSize: 22, paddingLeft: 14, borderLeft: `3px solid ${C.pink}` }}>{line}</li>
              ))}
            </ul>
          </>
        )}
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(ending.stats).map(([key, val]) => {
            const def = adventure.stats[key]
            if (!def) return null
            const display = def.display === 'money' ? `$${val.toLocaleString()}` : String(val)
            return (
              <div key={key} style={{ fontSize: 20, color: C.lavender }}>
                {def.label.toUpperCase()}: <span style={{ color: C.cream }}>{display}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onRestart}
          style={{ background: C.dim, border: `3px solid ${C.pink}`, color: C.pink, fontFamily: press, fontSize: 11, padding: '14px 18px', cursor: 'pointer' }}>
          PLAY AGAIN
        </button>
        <button onClick={onGoToSelect}
          style={{ background: C.dim, border: `3px solid ${C.lavender}`, color: C.lavender, fontFamily: press, fontSize: 11, padding: '14px 18px', cursor: 'pointer' }}>
          EPISODES
        </button>
      </div>
    </div>
  )
}

// ── main app ─────────────────────────────────────────────────────────────────

async function fetchScene(adventure, gameState, lastScene, choice, newState, authHeader, itemUse = null) {
  const recentBeats = gameState.history.slice(-4).map((h) => `You: "${h.text}"`)
  const act = currentAct(adventure, newState)
  const body = {
    adventureId: adventure.id,
    spice:       gameState.spice,
    stats:       newState.stats,
    flags:       newState.flags,
    inventory:   newState.inventory ?? [],
    memory:      newState.memory,
    recentBeats,
    lastScene:   { place: lastScene.place, speaker: lastScene.speaker, line: lastScene.line },
    choice:      choice ? { text: choice.text, hint: choice.hint ?? undefined } : null,
    beat:        newState.beat,
    actGoal:     act?.goal ?? null,
    itemUse:     itemUse ?? null,
  }
  const headers = { 'Content-Type': 'application/json' }
  if (authHeader) headers['Authorization'] = authHeader
  const res = await fetch('/api/scene', { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) return null
  const data = await res.json()
  return data.scene ?? null
}

export default function App() {
  const [adventureIdx, setAdventureIdx]   = useState(null)
  const [gameState, setGameState]         = useState(null)
  const [ending, setEnding]               = useState(null)
  const [loading, setLoading]             = useState(false)
  const [appSpice, setAppSpice]           = useState(2)
  const [showInventory, setShowInventory] = useState(false)
  const [playerAuth, setPlayerAuth]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)) } catch { return null }
  })
  const [showLogin, setShowLogin]       = useState(false)
  const fetchIdRef         = useRef(0)
  const pendingAdvIdx      = useRef(null)

  const adventure = adventureIdx !== null ? ADVENTURES[adventureIdx] : null

  useEffect(() => {
    if (!adventure) return
    const saved = localStorage.getItem(`${SAVE_KEY}-${adventure.id}`)
    if (saved) {
      try { setGameState(JSON.parse(saved)); setEnding(null); return } catch {}
    }
    setGameState(engineSetSpice(createState(adventure), appSpice))
    setEnding(null)
  }, [adventureIdx])

  useEffect(() => {
    if (adventure && gameState && !ending) {
      localStorage.setItem(`${SAVE_KEY}-${adventure.id}`, JSON.stringify(gameState))
    }
  }, [gameState, ending])

  const handleChoice = useCallback(async (idx) => {
    if (loading) return
    const lastScene = resolveScene(adventure, gameState)
    const result = choose(adventure, gameState, idx)
    if (result.status === 'scene') {
      setGameState(result.state)
    } else if (result.status === 'generate') {
      setLoading(true)
      const fetchId = ++fetchIdRef.current
      try {
        const generatedScene = await fetchScene(adventure, gameState, lastScene, result.choice, result.state, playerAuth?.authHeader)
        if (fetchId !== fetchIdRef.current) return
        const scene = generatedScene ?? fallbackScene(result.state)
        setGameState(provideGeneratedScene(adventure, result.state, scene))
      } catch {
        if (fetchId !== fetchIdRef.current) return
        const fb = fallbackScene(result.state)
        setGameState(provideGeneratedScene(adventure, result.state, fb))
      } finally {
        if (fetchId === fetchIdRef.current) setLoading(false)
      }
    } else if (result.status === 'end') {
      setGameState(result.state)
      setEnding(result.ending)
      localStorage.removeItem(`${SAVE_KEY}-${adventure.id}`)
    }
  }, [adventure, gameState, loading, playerAuth])

  const handleGoToSelect = useCallback(() => {
    fetchIdRef.current++
    setLoading(false)
    setAdventureIdx(null)
  }, [])

  const handleLoginSuccess = useCallback(({ name, authHeader }) => {
    const auth = { name, authHeader }
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
    setPlayerAuth(auth)
    setShowLogin(false)
    if (pendingAdvIdx.current !== null) {
      setAdventureIdx(pendingAdvIdx.current)
      pendingAdvIdx.current = null
    }
  }, [])

  const handleSelectAdventure = useCallback((idx) => {
    fetchIdRef.current++
    setLoading(false)
    setEnding(null)
    if (!playerAuth) {
      pendingAdvIdx.current = idx
      setShowLogin(true)
      return
    }
    setAdventureIdx(idx)
  }, [playerAuth])

  const handleNewGameSelect = useCallback((idx) => {
    if (!playerAuth) {
      pendingAdvIdx.current = idx
      setShowLogin(true)
      return
    }
    const adv = ADVENTURES[idx]
    localStorage.removeItem(`${SAVE_KEY}-${adv.id}`)
    setGameState(engineSetSpice(createState(adv), appSpice))
    setEnding(null)
    setAdventureIdx(idx)
  }, [playerAuth, appSpice])

  const handleRestart = useCallback(() => {
    if (!adventure) return
    localStorage.removeItem(`${SAVE_KEY}-${adventure.id}`)
    setGameState(createState(adventure))
    setEnding(null)
  }, [adventure])

  const handleDropItem = useCallback((item) => {
    setGameState(prev => {
      if (!prev) return prev
      return {
        ...prev,
        inventory: prev.inventory.filter(i => {
          if (typeof i === 'string') return i !== item.id
          return item.id ? i.id !== item.id : i.label !== item.label
        }),
      }
    })
  }, [])

  const handleUseItem = useCallback(async (item) => {
    if (loading) return
    setShowInventory(false)
    const lastScene = resolveScene(adventure, gameState)
    const result = engineUseItem(adventure, gameState, item)
    // result.status is always 'generate'
    setLoading(true)
    const fetchId = ++fetchIdRef.current
    try {
      const generatedScene = await fetchScene(
        adventure, gameState, lastScene, null, result.state, playerAuth?.authHeader, result.itemUse
      )
      if (fetchId !== fetchIdRef.current) return
      const scene = generatedScene ?? fallbackScene(result.state)
      const stateWithScene = provideGeneratedScene(adventure, result.state, scene)
      // resolve consumed: remove item if LLM accepted it
      setGameState(resolveItemUse(stateWithScene, scene.consumed === true))
    } catch {
      if (fetchId !== fetchIdRef.current) return
      setGameState(provideGeneratedScene(adventure, result.state, fallbackScene(result.state)))
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false)
    }
  }, [adventure, gameState, loading, playerAuth])

  if (adventureIdx === null) {
    return (
      <>
        <EpisodeSelect onSelect={handleSelectAdventure} onNewGame={handleNewGameSelect} spice={appSpice} onSpice={setAppSpice} />
        {showLogin && <LoginModal onSuccess={handleLoginSuccess} />}
      </>
    )
  }

  if (!gameState) return null

  if (ending) {
    return <EndingScreen ending={ending} adventure={adventure} onRestart={handleRestart} onGoToSelect={handleGoToSelect} />
  }

  if (showInventory) {
    return (
      <InventoryScreen
        inventory={gameState.inventory ?? []}
        adventure={adventure}
        onDrop={handleDropItem}
        onUse={handleUseItem}
        onBack={() => setShowInventory(false)}
      />
    )
  }

  if (gameState.pendingInventoryOffer?.length > 0) {
    return (
      <SwapPrompt
        offeredItem={gameState.pendingInventoryOffer[0]}
        inventory={gameState.inventory ?? []}
        adventure={adventure}
        onAccept={(droppedId) => setGameState(acceptInventoryOffer(gameState, droppedId))}
        onDecline={() => setGameState(declineInventoryOffer(gameState))}
      />
    )
  }

  const scene      = resolveScene(adventure, gameState)
  const choices    = visibleChoices(scene, gameState)
  const castData   = CASTS[adventure.cast] ?? lakeSparkleCast
  const speakerDef = scene.speaker ? castData.characters[scene.speaker] : null

  return (
    <div style={{ background: scanlines, minHeight: '100dvh', padding: '20px 16px max(20px, env(safe-area-inset-bottom, 20px))', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 600, margin: '0 auto' }}>

      {/* ── header ── */}
      <div style={{ borderBottom: `4px double ${C.pink}`, paddingBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/icon-512.png" alt="" aria-hidden="true" style={{ height: 56, width: 56, imageRendering: 'pixelated', flexShrink: 0 }} />
          <img src="/title.png" alt="Real You-wives" style={{ flex: 1, minWidth: 0, imageRendering: 'pixelated' }} />
        </div>
        <div style={{ fontSize: 20, color: C.gold }}>
          {adventure.season && adventure.episodeNumber
            ? <span style={{ fontFamily: press, fontSize: 8, color: C.pink, marginRight: 8 }}>S{adventure.season} · EP {adventure.episodeNumber}</span>
            : null}
          {adventure.episode}
        </div>
      </div>

      {/* ── stats ── */}
      <StatsRow stats={gameState.stats} adventure={adventure} />

      {/* ── scene panel ── */}
      <div style={{ background: C.panel, border: `3px solid ${C.gold}`, padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 17, color: C.lavender, letterSpacing: 1 }}>{scene.place}</div>
        <div style={{ fontSize: 24, lineHeight: 1.3 }}>
          <TypedText key={scene.narration} text={scene.narration} />
        </div>
        {scene.speaker && speakerDef && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginTop: 4 }}>
            <Portrait look={speakerDef.look} mood={scene.mood} fx={scene.fx} name={scene.speaker} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: press, fontSize: 9, color: C.pink, marginBottom: 8, lineHeight: 1.8 }}>{scene.speaker}</div>
              <div style={{ fontSize: 22, lineHeight: 1.3 }}>
                "<TypedText key={scene.line} text={scene.line} />"
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── confessional ── */}
      {scene.confessional && (
        <div style={{ border: `2px dashed ${C.teal}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: press, fontSize: 8, color: C.teal, letterSpacing: 1 }}>CONFESSIONAL CUT</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {scene.speaker && speakerDef && (
              <ConfessionalPortrait look={speakerDef.look} mood={scene.mood} name={scene.speaker} />
            )}
            <div style={{ fontSize: 22, lineHeight: 1.3, color: C.teal, flex: 1 }}>"{scene.confessional}"</div>
          </div>
        </div>
      )}

      {/* ── inventory strip ── */}
      {(gameState.inventory ?? []).length > 0 && (
        <button onClick={() => setShowInventory(true)}
          style={{ display: 'flex', gap: 8, alignItems: 'center', background: C.panel, border: `2px solid ${C.gold}`, padding: '8px 12px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
          <span style={{ fontFamily: press, fontSize: 8, color: C.gold, flexShrink: 0 }}>BAG:</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden' }}>
            {(gameState.inventory ?? []).map((item, i) => {
              const norm = normalizeInventoryItem(item, adventure)
              return (
                <div key={i} title={norm.label} style={{ flexShrink: 0 }}>
                  <ItemSprite sprite={norm.sprite} size={32} label={norm.label} />
                </div>
              )
            })}
          </div>
        </button>
      )}

      {/* ── choices ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontFamily: press, fontSize: 10, color: C.gold, marginBottom: 2 }}>
          {loading ? 'THE PRODUCERS ARE DECIDING…' : 'WHAT DO YOU DO?'}
        </div>
        {loading
          ? <div style={{ fontSize: 22, color: C.lavender, padding: '10px 0' }}>[ live feed buffering ]</div>
          : choices.map((choice, i) => (
            <button
              key={i}
              className="choice-btn"
              onClick={() => handleChoice(i)}
              style={{
                display: 'flex', gap: 12, alignItems: 'center',
                background: C.dim, border: `2px solid ${C.pink}`,
                color: C.cream, fontFamily: vt, fontSize: 22,
                padding: '10px 14px', textAlign: 'left',
                minHeight: 54, width: '100%',
                transition: 'background .12s, border-color .12s, transform .12s',
              }}
            >
              <span style={{ fontFamily: press, fontSize: 11, color: C.gold, flexShrink: 0 }}>
                {String.fromCharCode(65 + i)}
              </span>
              {choice.text}
            </button>
          ))
        }
      </div>

      {/* ── footer ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 10, borderTop: `2px solid ${C.dim}` }}>
        <span style={{ fontSize: 18, color: C.lavender, flex: 1 }}>
          {playerAuth?.name && <span style={{ color: C.pink }}>{playerAuth.name} · </span>}
          {adventure.season && adventure.episodeNumber
            ? `S${adventure.season} · EP ${adventure.episodeNumber}`
            : adventure.label}
        </span>
        <button className="ep-btn" onClick={handleGoToSelect}
          style={{ fontFamily: press, fontSize: 9, padding: '0 12px', minHeight: 44, background: C.dim, color: C.lavender, border: `2px solid ${C.lavender}`, cursor: 'pointer' }}>
          EPISODES
        </button>
      </div>

    </div>
  )
}
