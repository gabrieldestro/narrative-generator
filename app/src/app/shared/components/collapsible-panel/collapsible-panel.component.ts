import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'ng-collapsible-panel',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collapsible-panel.component.html',
  styleUrl: './collapsible-panel.component.scss',
})
export class CollapsiblePanelComponent {
  @Input({ required: true }) title!: string;
  @Input() icon = '';
}

