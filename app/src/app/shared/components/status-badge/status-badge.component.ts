import { Component, Input } from '@angular/core';

export type BadgeType = 'success' | 'warning' | 'error' | 'info';

@Component({
  selector: 'ng-status-badge',
  standalone: true,
  template: `
    <span class="status-badge status-badge--{{ type }}">
      <span class="status-badge__icon">{{ icon }}</span>
      <span class="status-badge__label">{{ label }}</span>
    </span>
  `,
  styles: [`
    .status-badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .status-badge--success { background: rgba(76,175,80,0.15); color: #4caf50; }
    .status-badge--warning { background: rgba(255,152,0,0.15); color: #ff9800; }
    .status-badge--error { background: rgba(229,57,53,0.15); color: #e53935; }
    .status-badge--info { background: rgba(66,165,245,0.15); color: #42a5f5; }
  `]
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
