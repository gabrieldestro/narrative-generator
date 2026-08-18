import { Component, Input } from '@angular/core';
import type { Location } from '../../../../core/models/location.model';

@Component({
  selector: 'ng-map-graph',
  standalone: true,
  templateUrl: './map-graph.component.html',
  styleUrl: './map-graph.component.scss'
})
export class MapGraphComponent {
  @Input() locations: Location[] = [];
  @Input() currentLocationId: string | null = null;
}
