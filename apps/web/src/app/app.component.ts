import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';
import { OfflineCoordinatorService } from './core/services/offline-coordinator.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="route-anim-host">
      <router-outlet />
    </div>
  `,
})
export class AppComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly offlineCoordinator = inject(OfflineCoordinatorService);

  ngOnInit(): void {
    // Attempt to restore session on cold start
    this.offlineCoordinator.start();
    void this.authService.initialize().catch(() => undefined);
  }
}
