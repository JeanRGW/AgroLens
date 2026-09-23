import { Component, Input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="loading-wrap">
      <mat-spinner [diameter]="diameter"></mat-spinner>
      @if (message) {
        <span class="loading-message">{{ message }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .loading-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      min-height: 180px;
      color: var(--agri-text-muted);
    }

    .loading-message {
      font-size: 0.85rem;
      font-weight: 500;
      letter-spacing: 0.02em;
    }
  `,
})
export class LoadingStateComponent {
  @Input() message = '';
  @Input() diameter = 40;
}
