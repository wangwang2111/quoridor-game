// Simple HTMLAudio-based sound manager. Autoplay-safe: bg starts after a user gesture.
class SoundManager {
  constructor() {
    this.muted = false
    this.volume = 0.6
    this.unlocked = false
    this.a = {
      bg:    this._make('/sounds/bg.mp3', true),
      move:  this._make('/sounds/move.mp3'),
      wall:  this._make('/sounds/wall.mp3'),
      win:   this._make('/sounds/win.mp3'),
      lose:  this._make('/sounds/lose.mp3'),
    }
  }
  _make(src, loop=false) {
    const el = new Audio(src)
    el.loop = loop
    el.preload = 'auto'
    el.volume = this.volume
    el.muted = this.muted
    return el
  }
  setMuted(m) {
    this.muted = m
    Object.values(this.a).forEach(el => el.muted = m)
  }
  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v))
    Object.values(this.a).forEach(el => { el.volume = this.volume })
  }
  // Call after any user click in menu to satisfy autoplay policies.
  unlock() {
    if (this.unlocked) return
    this.unlocked = true
    try { this.a.bg.play().catch(()=>{}) } catch {}
  }
  playBg() {
    if (!this.unlocked) return // wait for user gesture
    try { if (this.a.bg.paused) this.a.bg.play() } catch {}
  }
  stopBg() {
    try { this.a.bg.pause(); this.a.bg.currentTime = 0 } catch {}
  }
  play(name) {
    if (this.muted) return
    const el = this.a[name]
    if (!el) return
    try {
      // “retrigger” fast sounds by cloning if mid-play
      if (!el.paused && !el.loop) {
        const clone = el.cloneNode()
        clone.volume = this.volume
        clone.muted = this.muted
        clone.play().catch(()=>{})
      } else {
        el.currentTime = 0
        el.play().catch(()=>{})
      }
    } catch {}
  }
}

const Sound = new SoundManager()
export default Sound
