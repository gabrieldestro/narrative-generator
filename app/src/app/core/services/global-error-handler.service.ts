import { Injectable, ErrorHandler, inject } from '@angular/core';
import { LoggingService } from './logging.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly logging = inject(LoggingService);

  handleError(error: Error): void {
    this.logging.error('Erro não tratado', error);

    if (!(error instanceof Error)) {
      console.error('Erro não tratado (não-Error):', error);
      return;
    }

    const chunkFailedMessage = /Loading chunk [\d]+ failed/i;
    if (chunkFailedMessage.test(error.message)) {
      window.location.reload();
    }
  }
}
