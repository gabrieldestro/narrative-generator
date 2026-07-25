import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs/operators';
import { LoggingService } from '../services/logging.service';

export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  const log = inject(LoggingService);
  const start = performance.now();
  const method = req.method;
  const url = req.urlWithParams;

  log.debug('API request', { method, url, bodySize: req.body ? JSON.stringify(req.body).length : 0 });

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          const durationMs = Math.round(performance.now() - start);
          log.info('API response', {
            method,
            url,
            status: event.status,
            durationMs,
          });
        }
      },
      error: (err) => {
        const durationMs = Math.round(performance.now() - start);
        log.error('API error', err instanceof Error ? err : new Error(String(err)), {
          method,
          url,
          status: err.status ?? 0,
          durationMs,
        });
      },
    }),
  );
};
