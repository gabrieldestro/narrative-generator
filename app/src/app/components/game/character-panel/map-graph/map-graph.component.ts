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
    .map-graph { padding: 0.75rem 1rem; }
    .map-graph__empty { color: var(--text-muted); font-size: 0.875rem; font-style: italic; }
    .map-graph__nodes { display: flex; flex-direction: column; gap: 0.5rem; }
    .map-graph__node {
      padding: 0.5rem;
      border-radius: 8px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      text-align: center;
      cursor: default;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .map-graph__node--current {
      border-color: var(--accent);
      background: rgba(255, 213, 79, 0.08);
      box-shadow: 0 0 12px rgba(255, 213, 79, 0.12);
    }
    .map-graph__node--unvisited { opacity: 0.5; }
    .map-graph__node-name { font-family: 'Outfit', sans-serif; font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); }
  `]
})
export class MapGraphComponent {
  @Input() locations: Location[] = [];
  @Input() currentLocationId: string | null = null;
}
