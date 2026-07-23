import { Injectable, inject } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiService } from '../services/api.service';
import { GameStateService } from '../services/game-state.service';

@Injectable({ providedIn: 'root' })
export class SessionGuard implements CanActivate {
  private readonly api = inject(ApiService);
  private readonly gameState = inject(GameStateService);
  private readonly router = inject(Router);

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const sessionId = route.paramMap.get('sessionId')!;

    return this.api.getGameState(sessionId).pipe(
      map(response => {
        this.gameState.setGameState(sessionId, response.state);
        return true;
      }),
      catchError(() => of(this.router.parseUrl('/new-game'))),
    );
  }
}
