import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';

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

  ngOnInit(): void {
    // Attempt to restore session on cold start
    void this.authService.initialize().catch(() => undefined);
  }
}
