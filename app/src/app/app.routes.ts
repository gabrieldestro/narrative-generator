import { Routes } from '@angular/router';
import { SessionGuard } from './core/guards/session.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/new-game',
    pathMatch: 'full',
  },
  {
    path: 'new-game',
    loadComponent: () => import('./components/new-game/new-game.component')
      .then(m => m.NewGameComponent),
    title: 'Nova Aventura — Narrative Generator',
  },
  {
    path: 'new-game/custom',
    loadComponent: () => import('./components/new-game/custom-scenario-page.component')
      .then(m => m.CustomScenarioPageComponent),
    title: 'Cenário Personalizado — Narrative Generator',
  },
  {
    path: 'game/:sessionId',
    loadComponent: () => import('./components/game/game.component')
      .then(m => m.GameComponent),
    canActivate: [SessionGuard],
    title: 'Jogo — Narrative Generator',
  },
  {
    path: 'settings',
    loadComponent: () => import('./components/settings/settings.component')
      .then(m => m.SettingsComponent),
    title: 'Configurações — Narrative Generator',
  },
  {
    path: '**',
    redirectTo: '/new-game',
  },
];
