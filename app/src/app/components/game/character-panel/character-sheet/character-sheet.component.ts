import { Component, Input } from '@angular/core';
import { StatusBadgeComponent, type BadgeType } from '../../../../shared/components/status-badge/status-badge.component';
import type { Character } from '../../../../core/models/character.model';

@Component({
  selector: 'ng-character-sheet',
  standalone: true,
  imports: [StatusBadgeComponent],
  template: `
    <div class="character-sheet" [class.character-sheet--compact]="!expanded">
      <div class="character-sheet__header" (click)="expanded = !expanded">
        <span class="character-sheet__avatar">👤</span>
        <span class="character-sheet__name">{{ character.name }}</span>
        <ng-status-badge [type]="statusType"/>
      </div>

      @if (expanded) {
        <div class="character-sheet__body">
          <div class="character-sheet__field">
            <span class="character-sheet__label">Local:</span>
            <span>{{ character.currentLocation || 'Desconhecido' }}</span>
          </div>
          <div class="character-sheet__field">
            <span class="character-sheet__label">Descrição:</span>
            <span>{{ character.description }}</span>
          </div>
          @if (character.currentObjective) {
            <div class="character-sheet__field">
              <span class="character-sheet__label">Objetivo:</span>
              <span>{{ character.currentObjective }}</span>
            </div>
          }
          @if (character.longTermObjective) {
            <div class="character-sheet__field">
              <span class="character-sheet__label">Objetivo Final:</span>
              <span>{{ character.longTermObjective }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .character-sheet {
      border-bottom: 1px solid var(--divider);
      padding: 0.75rem 1rem;
      transition: background 0.2s ease;
    }
    .character-sheet:hover { background: rgba(137, 180, 250, 0.03); }
    .character-sheet--compact { cursor: pointer; }
    .character-sheet__header { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
    .character-sheet__avatar { font-size: 1.2rem; }
    .character-sheet__name { flex: 1; font-family: 'Outfit', sans-serif; font-weight: 600; color: var(--text-primary); }
    .character-sheet__body { padding-top: 0.6rem; display: flex; flex-direction: column; gap: 0.35rem; }
    .character-sheet__field { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; }
    .character-sheet__label {
      color: var(--text-muted);
      font-family: 'Outfit', sans-serif;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
  `]
})
export class CharacterSheetComponent {
  @Input({ required: true }) character!: Character;
  expanded = false;

  get statusType(): BadgeType {
    const status = this.character.status;
    if (status === 'dead' || status === 'lost') return 'error';
    return 'success';
  }
}
