import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import type { WorldTemplate } from '../../core/models/world-template.model';

@Component({
  selector: 'ng-game-card',
  standalone: true,
  imports: [MatCardModule, MatChipsModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="game-card" (click)="onPlay()" role="button" [attr.aria-label]="'Jogar ' + world.name" tabindex="0" (keydown.enter)="onPlay()" (keydown.space)="onPlay(); $event.preventDefault()">
      <mat-card-header>
        <div class="game-card__icon" [style.color]="iconColor" aria-hidden="true">{{ worldIcon }}</div>
        <mat-card-title>{{ world.name }}</mat-card-title>
        <mat-card-subtitle>{{ world.description }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <mat-chip-set>
          <mat-chip class="game-card__chip">{{ world.narrativeStyle }}</mat-chip>
          <mat-chip class="game-card__chip">{{ world.writingStyle }}</mat-chip>
        </mat-chip-set>
      </mat-card-content>
      <mat-card-actions>
        <button mat-raised-button color="primary" (click)="onPlay(); $event.stopPropagation()" aria-label="Jogar {{ world.name }}">
          Jogar
        </button>
        <button mat-stroked-button (click)="onUseAsBase($event)" aria-label="Usar {{ world.name }} como base">
          Usar como Base
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .game-card { cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; width: 100%; height: 360px; display: flex; flex-direction: column; overflow: hidden; }
    .game-card:hover { transform: translateY(-4px); box-shadow: 0 8px 16px rgba(0,0,0,0.4); }
    .game-card__icon { font-size: 2.5rem; margin-bottom: 0.25rem; }
    mat-card-header { flex-direction: column; align-items: center; text-align: center; flex-shrink: 0; padding: 16px 16px 0 16px; }
    ::ng-deep mat-card-header .mat-mdc-card-header-text { overflow: hidden; width: 100%; }
    mat-card-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1.1rem; }
    mat-card-subtitle { overflow-y: auto; max-height: 66px; scrollbar-width: thin; margin-top: 4px; word-break: break-word; }
    mat-card-content { flex-shrink: 0; padding: 8px 16px; }
    mat-chip-set { justify-content: center; gap: 6px; flex-wrap: nowrap; overflow: hidden; }
    .game-card__chip { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
    mat-card-actions { justify-content: center; gap: 8px; margin-top: auto; flex-shrink: 0; padding: 8px 16px 16px; min-width: 0; }
    mat-card-actions button { font-size: 0.8rem; min-width: 0; }
  `]
})
export class GameCardComponent {
  @Input({ required: true }) world!: WorldTemplate;
  @Output() play = new EventEmitter<string>();
  @Output() useAsBase = new EventEmitter<WorldTemplate>();

  private readonly iconMap: Record<string, { icon: string; color: string }> = {
    'Fantasia': { icon: '🏰', color: '#c9a84c' },
    'Cyberpunk': { icon: '🌃', color: '#ff6ec7' },
    'Terror': { icon: '👻', color: '#8a8a8a' },
    'Thriller': { icon: '🎭', color: '#9c27b0' },
  };

  get worldIcon(): string {
    return Object.entries(this.iconMap).find(([key]) =>
      this.world.narrativeStyle.includes(key)
    )?.[1].icon ?? '📜';
  }

  get iconColor(): string {
    return Object.entries(this.iconMap).find(([key]) =>
      this.world.narrativeStyle.includes(key)
    )?.[1].color ?? '#c9a84c';
  }

  onPlay(): void {
    this.play.emit(this.world.id ?? this.world.name);
  }

  onUseAsBase(event: MouseEvent): void {
    event.stopPropagation();
    this.useAsBase.emit(this.world);
  }
}
