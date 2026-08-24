import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatChipInputEvent } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import type { CharacterTemplate } from '../../../../core/models/world-template.model';
import type { Location } from '../../../../core/models/location.model';
import type { WorldTemplate } from '../../../../core/models/world-template.model';
import { EnrichButtonComponent } from '../enrich-button/enrich-button.component';

@Component({
  selector: 'ng-characters-editor',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatChipsModule,
    MatDividerModule,
    EnrichButtonComponent,
  ],
  templateUrl: './characters-editor.component.html',
})
export class CharactersEditorComponent {
  @Input() characters: CharacterTemplate[] = [];
  @Input() locations: Location[] = [];
  @Input() getContext: () => WorldTemplate | null = () => null;
  @Output() charactersChange = new EventEmitter<CharacterTemplate[]>();

  readonly separatorKeys = [ENTER, COMMA];

  addCharacter(): void {
    this.characters.push({
      name: '',
      description: '',
      personality: '',
      isPlayer: this.characters.length === 0,
      inventory: [],
    });
    this.emit();
  }

  removeCharacter(index: number): void {
    this.characters.splice(index, 1);
    this.emit();
  }

  onPlayerChange(char: CharacterTemplate, isPlayer: boolean): void {
    char.isPlayer = isPlayer;
    if (isPlayer) {
      for (const other of this.characters) {
        if (other !== char) other.isPlayer = false;
      }
    }
    this.emit();
  }

  addInventoryItem(char: CharacterTemplate, event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) {
      char.inventory = [...(char.inventory ?? []), value];
    }
    event.chipInput.clear();
  }

  removeInventoryItem(char: CharacterTemplate, index: number): void {
    char.inventory = (char.inventory ?? []).filter((_, i) => i !== index);
  }

  private emit(): void {
    this.charactersChange.emit(this.characters);
  }
}
