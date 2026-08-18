import { Component, Input } from '@angular/core';

export type BadgeType = 'success' | 'warning' | 'error' | 'info';

@Component({
  selector: 'ng-status-badge',
  standalone: true,
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss'
})
export class StatusBadgeComponent {
  @Input({ required: true }) type: BadgeType = 'info';

  private readonly iconMap: Record<BadgeType, string> = {
    success: '✓', warning: '⚠', error: '✗', info: 'i',
  };
  private readonly labelMap: Record<BadgeType, string> = {
    success: 'Ativo', warning: 'Atenção', error: 'Perdido', info: 'Info',
  };

  get icon(): string { return this.iconMap[this.type]; }
  get label(): string { return this.labelMap[this.type]; }
}
