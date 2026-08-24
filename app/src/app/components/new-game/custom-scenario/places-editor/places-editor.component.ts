import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import type { Location } from '../../../../core/models/location.model';
import type { WorldTemplate } from '../../../../core/models/world-template.model';
import { EnrichButtonComponent } from '../enrich-button/enrich-button.component';

@Component({
  selector: 'ng-places-editor',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDividerModule,
    EnrichButtonComponent,
  ],
  templateUrl: './places-editor.component.html',
})
export class PlacesEditorComponent {
  @Input() locations: Location[] = [];
  @Input() getContext: () => WorldTemplate | null = () => null;
  @Output() locationsChange = new EventEmitter<Location[]>();

  addLocation(): void {
    this.locations.push({
      id: this.genId(),
      name: '',
      description: '',
      connectedTo: [],
    });
    this.emit();
  }

  removeLocation(index: number): void {
    const removed = this.locations[index];
    this.locations.splice(index, 1);
    // remove referências a este local em outras conexões
    for (const loc of this.locations) {
      loc.connectedTo = (loc.connectedTo ?? []).filter((id) => id !== removed?.id);
    }
    this.emit();
  }

  otherLocations(self: Location): Location[] {
    return this.locations.filter((l) => l.id !== self.id);
  }

  private genId(): string {
    return `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  private emit(): void {
    this.locationsChange.emit(this.locations);
  }
}
