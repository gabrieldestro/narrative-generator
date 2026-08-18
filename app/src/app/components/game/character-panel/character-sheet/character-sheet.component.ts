import { Component, Input } from '@angular/core';
import { StatusBadgeComponent, type BadgeType } from '../../../../shared/components/status-badge/status-badge.component';
import type { Character } from '../../../../core/models/character.model';

@Component({
  selector: 'ng-character-sheet',
  standalone: true,
  imports: [StatusBadgeComponent],
  templateUrl: './character-sheet.component.html',
  styleUrl: './character-sheet.component.scss'
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
