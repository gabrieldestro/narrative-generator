import { Component, Input } from '@angular/core';
import type { Character } from '../../../../core/models/character.model';

@Component({
  selector: 'ng-inventory-panel',
  standalone: true,
  templateUrl: './inventory-panel.component.html',
  styleUrl: './inventory-panel.component.scss'
})
export class InventoryPanelComponent {
  @Input() items: string[] = [];
}
