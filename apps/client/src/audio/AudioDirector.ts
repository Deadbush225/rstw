import type { GameEvent } from '@signal-zero/shared';

/** Original procedural UI/ambient cues; no sampled or third-party audio is shipped. */
export class AudioDirector {
  private context: AudioContext | null = null;
  private enabled = true;
  private masterVolume = 1;
  private ambientTimer: number | null = null;

  constructor(private readonly toggle: HTMLButtonElement) {
    this.toggle.addEventListener('click', () => {
      this.setEnabled(!this.enabled);
    });
    window.addEventListener('pointerdown', () => void this.unlock(), { once: true });
    window.addEventListener('keydown', () => void this.unlock(), { once: true });
  }

  play(event: GameEvent): void {
    if (!this.enabled) return;
    const notes = this.notesFor(event);
    if (notes) void this.unlock().then(() => this.playNotes(notes));
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.toggle.textContent = `Sound: ${enabled ? 'on' : 'off'}`;
    this.toggle.setAttribute('aria-pressed', String(enabled));
    if (enabled && navigator.userActivation?.isActive) void this.unlock();
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  private notesFor(event: GameEvent): readonly number[] | null {
    switch (event.type) {
      case 'MATCH_STARTED':
        return [330, 495];
      case 'RELAY_CAPTURED':
        return [440, 660, 880];
      case 'PUMP_ACTIVATED':
        return [250, 375, 500];
      case 'CORE_PICKED_UP':
        return [523, 659];
      case 'CORE_DEPOSITED':
        return [523, 659, 784];
      case 'MATCH_WON':
        return [523, 659, 784, 1_046];
      case 'MATCH_EXPIRED':
        return [220, 165];
      case 'FLOOD_STARTED':
        return [196, 147];
      case 'ABILITY_CAST':
        return event.slot === 'W' ? [392, 523] : [660];
      case 'HIT':
        return [140];
      default:
        return null;
    }
  }

  destroy(): void {
    if (this.ambientTimer !== null) window.clearInterval(this.ambientTimer);
    void this.context?.close();
  }

  private async unlock(): Promise<void> {
    if (!this.enabled) return;
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    if (this.ambientTimer === null) {
      this.playNotes([110, 165], 0.018, 0.55);
      this.ambientTimer = window.setInterval(() => this.playNotes([110, 147], 0.012, 0.5), 8_000);
    }
  }

  private playNotes(notes: readonly number[], volume = 0.06, duration = 0.13): void {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.enabled) return;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * duration * 0.78;
      oscillator.type = index % 2 === 0 ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * this.masterVolume),
        start + 0.015,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    });
  }
}
