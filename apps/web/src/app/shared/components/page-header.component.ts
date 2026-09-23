import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <div class="page-header-row">
      <div class="page-header-text">
        <p class="eyebrow">{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
        @if (subtitle) {
          <p class="subtitle">{{ subtitle }}</p>
        }
      </div>
      <ng-content></ng-content>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .page-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
    }

    .page-header-text {
      display: flex;
      flex-direction: column;
    }

    .eyebrow {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--agri-accent-dark);
      background: var(--agri-fill);
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      width: fit-content;
      animation: agri-pop-in var(--motion-med) var(--ease-out) both;
    }

    h1 {
      margin: 0.35rem 0 0;
      font-size: 1.45rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--agri-text);
      animation: agri-rise-in var(--motion-med) var(--ease-out) 60ms both;
    }

    .subtitle {
      margin: 0.3rem 0 0;
      color: var(--agri-text-secondary);
      font-size: 0.9rem;
      line-height: 1.4;
      animation: agri-rise-in var(--motion-med) var(--ease-out) 120ms both;
    }

    @media (max-width: 720px) {
      .page-header-row {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `,
})
export class PageHeaderComponent {
  @Input({ required: true }) eyebrow = '';
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
}
