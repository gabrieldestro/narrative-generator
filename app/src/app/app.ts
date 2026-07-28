import { Component, HostListener, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoggingService } from './core/services/logging.service';

@Component({
  selector: 'ng-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly logger = inject(LoggingService);

  @HostListener('document:keydown.control.shift.l')
  onDownloadLogs(): void {
    this.logger.downloadLogs();
  }
}
