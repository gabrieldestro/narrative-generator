import { Injectable, signal } from '@angular/core';
import type { GameSettings } from '../models/game-settings.model';
import { DEFAULT_GAME_SETTINGS } from '../models/game-settings.model';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly STORAGE_KEY = 'narrative_generator_settings';
  private readonly settingsSignal = signal<GameSettings>({ ...DEFAULT_GAME_SETTINGS });

  readonly settings = this.settingsSignal.asReadonly();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<GameSettings>;
        this.settingsSignal.set({ ...DEFAULT_GAME_SETTINGS, ...parsed });
      } catch {
        // Se corrompido, usa default
      }
    }
  }

  updateSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    this.settingsSignal.update(s => ({ ...s, [key]: value }));
    this.saveToStorage();
  }

  private saveToStorage(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settingsSignal()));
  }
}
