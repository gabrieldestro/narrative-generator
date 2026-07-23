import { Component, Input } from '@angular/core';
import type { Location } from '../../../../core/models/location.model';

@Component({
  selector: 'ng-map-graph',
  standalone: true,
  template: `
    <div class="map-graph">
      <h4 class="section-title">MAPA</h4>
      @if (locations.length === 0) {
        <p class="map-graph__empty">Nenhum local descoberto</p>
      } @else {
        <div class="map-graph__nodes">
          @for (loc of locations; track loc.id) {
            <div class="map-graph__node"
              [class.map-graph__node--current]="loc.id === currentLocationId"
              [class.map-graph__node--unvisited]="!loc.connectedTo || loc.connectedTo.length === 0">
              <span class="map-graph__node-name">{{ loc.name }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .map-graph { padding: 0.75rem; }
    .map-graph__empty { color: #666; font-size: 0.875rem; }
    .map-graph__nodes { display: flex; flex-direction: column; gap: 0.5rem; }
    .map-graph__node { padding: 0.5rem; border-radius: 8px; background: #2a2a2a; border: 2px solid #333; text-align: center; cursor: default; }
    .map-graph__node--current { border-color: #c9a84c; background: rgba(201,168,76,0.1); }
    .map-graph__node--unvisited { opacity: 0.5; }
    .map-graph__node-name { font-size: 0.875rem; color: #e0e0e0; }
  `]
})
export class MapGraphComponent {
  @Input() locations: Location[] = [];
  @Input() currentLocationId: string | null = null;
}
