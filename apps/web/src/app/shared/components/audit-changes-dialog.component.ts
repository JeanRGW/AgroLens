import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { diffRecords, formatChangeValue } from '../utils/audit-changes';

export interface AuditChangesDialogData {
  eventLabel: string;
  createdAt: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

@Component({
  selector: 'app-audit-changes-dialog',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Alterações do evento</h2>
    <mat-dialog-content>
      <p class="event-meta">
        {{ data.eventLabel }} · {{ data.createdAt | date: 'dd/MM/yyyy HH:mm' }}
      </p>

      @if (changedRows().length > 0) {
        <div class="diff-grid" role="table" aria-label="Comparativo antes e depois">
          <div class="diff-head" role="row">
            <span role="columnheader">Campo</span>
            <span role="columnheader">Antes</span>
            <span role="columnheader">Depois</span>
          </div>
          @for (row of changedRows(); track row.key) {
            <div class="diff-row" [attr.data-status]="row.status" role="row">
              <span class="diff-key" role="cell">
                {{ row.key }}
                <span class="status-badge">{{ statusLabel(row.status) }}</span>
              </span>
              <span class="diff-value before" role="cell">{{ formatValue(row.before) }}</span>
              <span class="diff-value after" role="cell">{{ formatValue(row.after) }}</span>
            </div>
          }
        </div>
      } @else {
        <p class="no-changes">Sem alterações de campos.</p>
      }

      @if (unchangedCount() > 0) {
        <details class="collapsible">
          <summary>{{ unchangedCount() }} campos sem alteração</summary>
          <dl class="meta-list">
            @for (row of unchangedRows(); track row.key) {
              <div>
                <dt>{{ row.key }}</dt>
                <dd>{{ formatValue(row.after) }}</dd>
              </div>
            }
          </dl>
        </details>
      }

      @if (hasMetadata()) {
        <details class="collapsible">
          <summary>Detalhes do evento</summary>
          <dl class="meta-list">
            @for (entry of metadataEntries(); track entry[0]) {
              <div>
                <dt>{{ entry[0] }}</dt>
                <dd>{{ formatValue(entry[1]) }}</dd>
              </div>
            }
          </dl>
        </details>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="true">Fechar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .event-meta {
      margin: 0 0 1rem;
      font-size: 0.85rem;
      color: var(--agri-text-secondary);
    }

    .no-changes {
      margin: 0 0 0.25rem;
      font-size: 0.85rem;
      color: var(--agri-text-secondary);
    }

    .diff-grid {
      display: grid;
      grid-template-columns: minmax(120px, auto) minmax(0, 1fr) minmax(0, 1fr);
      border: 1px solid var(--agri-border);
      border-radius: 12px;
      overflow: hidden;
      font-size: 0.82rem;
    }

    .diff-head,
    .diff-row {
      display: contents;
    }

    .diff-head span {
      background: var(--agri-fill-subtle);
      color: var(--agri-text-secondary);
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 0.55rem 0.75rem;
      border-bottom: 2px solid var(--agri-border);
    }

    .diff-grid span[role='cell'] {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid var(--agri-border);
      overflow-wrap: anywhere;
      vertical-align: top;
    }

    .diff-row:last-child span[role='cell'] {
      border-bottom: none;
    }

    .diff-key {
      font-family: var(--agri-mono);
      font-size: 0.76rem;
      font-weight: 600;
      display: grid;
      gap: 0.25rem;
      align-content: start;
    }

    .diff-value {
      font-family: var(--agri-mono);
      font-size: 0.76rem;
      white-space: pre-wrap;
    }

    .diff-row[data-status='removed'] .before {
      background: #fdecea;
    }

    .diff-row[data-status='added'] .after {
      background: #e8f5e9;
    }

    .diff-row[data-status='changed'] .before {
      background: #fdecea;
    }

    .diff-row[data-status='changed'] .after {
      background: #e8f5e9;
    }

    .status-badge {
      width: fit-content;
      font-family: 'Sora', 'Segoe UI', sans-serif;
      font-size: 0.66rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.1rem 0.5rem;
      border-radius: 999px;
      background: var(--agri-fill);
      color: var(--agri-accent-dark);
    }

    .diff-row[data-status='added'] .status-badge {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .diff-row[data-status='removed'] .status-badge {
      background: #fdecea;
      color: #c62828;
    }

    .collapsible {
      margin-top: 0.85rem;
      border: 1px solid var(--agri-border);
      border-radius: 12px;
      padding: 0.6rem 0.85rem;
      font-size: 0.82rem;
    }

    .collapsible summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--agri-accent-dark);
    }

    .collapsible summary:focus-visible {
      outline: 2px solid var(--agri-accent);
      outline-offset: 2px;
      border-radius: 6px;
    }

    .meta-list {
      margin: 0.6rem 0 0;
      padding: 0;
      display: grid;
      gap: 0.45rem;
    }

    .meta-list > div {
      display: grid;
      gap: 0.1rem;
    }

    .meta-list dt {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--agri-text-muted);
    }

    .meta-list dd {
      margin: 0;
      font-family: var(--agri-mono);
      font-size: 0.76rem;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    @media (max-width: 720px) {
      .diff-grid {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }

      .diff-head span:first-child {
        display: none;
      }

      .diff-key {
        grid-column: 1 / -1;
        border-bottom: none !important;
        padding-bottom: 0 !important;
      }
    }
  `,
})
export class AuditChangesDialogComponent {
  readonly data = inject<AuditChangesDialogData>(MAT_DIALOG_DATA);

  readonly changedRows = computed(() =>
    diffRecords(this.data.before, this.data.after).filter((row) => row.status !== 'unchanged'),
  );

  readonly unchangedRows = computed(() =>
    diffRecords(this.data.before, this.data.after).filter((row) => row.status === 'unchanged'),
  );

  readonly unchangedCount = computed(() => this.unchangedRows().length);

  readonly metadataEntries = computed(() => Object.entries(this.data.metadata ?? {}));

  readonly hasMetadata = computed(() => this.metadataEntries().length > 0);

  formatValue(value: unknown): string {
    if (value !== null && typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return formatChangeValue(value);
  }

  statusLabel(status: string): string {
    if (status === 'added') return 'novo';
    if (status === 'removed') return 'removido';
    return 'alterado';
  }
}
