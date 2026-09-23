import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="empty-state-wrap">
      <div class="empty-icon-wrap">
        <mat-icon class="empty-icon">{{ icon }}</mat-icon>
      </div>
      @if (title) {
        <h2>{{ title }}</h2>
      }
      <p>{{ message }}</p>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .empty-state-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      padding: 2.5rem 1rem;
      text-align: center;
      color: var(--agri-text-muted);
      min-height: 140px;
    }

    .empty-icon-wrap {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--agri-fill);
      border: 1px dashed var(--agri-border-subtle);
      margin-bottom: 0.75rem;

      .empty-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
        color: var(--agri-text-muted);
      }
    }

    h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--agri-text);
    }

    p {
      margin: 0;
      font-size: 0.85rem;
      max-width: 380px;
      line-height: 1.45;
    }
  `,
})
export class EmptyStateComponent {
  @Input() icon = '';
  @Input() title = '';
  @Input({ required: true }) message = '';
}
