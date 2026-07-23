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
    .character-sheet { border-bottom: 1px solid #333; padding: 0.5rem; }
    .character-sheet--compact { cursor: pointer; }
    .character-sheet__header { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
    .character-sheet__avatar { font-size: 1.2rem; }
    .character-sheet__name { flex: 1; font-weight: 600; }
    .character-sheet__body { padding-top: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .character-sheet__field { font-size: 0.875rem; color: #a0a0a0; }
    .character-sheet__label { color: #666; }
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
