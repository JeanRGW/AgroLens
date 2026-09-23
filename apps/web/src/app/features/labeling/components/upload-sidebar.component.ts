import { Component, computed, input, output, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UploadRecord } from '../../../shared/models/upload-record';

@Component({
  selector: 'app-upload-sidebar',
  standalone: true,
  imports: [
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <mat-card class="sidebar-card">
      <div class="sidebar-header">
        <h2>Anotação YOLO</h2>
        <p>Selecione um upload para iniciar.</p>
      </div>

      <mat-form-field appearance="outline" class="search-field">
        <mat-label>Buscar upload</mat-label>
        <input
          matInput
          [value]="filterText()"
          (input)="filterText.set($any($event).target.value)"
        />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>

      @if (loading()) {
        <div class="state-wrap">
          <mat-spinner diameter="28"></mat-spinner>
          <span>Carregando uploads...</span>
        </div>
      } @else {
        <div class="uploads-list">
          @for (upload of filteredUploads(); track upload.id) {
            <button
              type="button"
              class="upload-item"
              [class.selected]="upload.id === selectedUploadId()"
              (click)="selectUpload.emit(upload)"
            >
              <div class="upload-item-main">
                <div class="upload-item-title">{{ upload.id }}</div>
                <div class="upload-item-meta">
                  <span class="meta-chip">{{ upload.fileCount }} imagens</span>
                  @if (upload.cropTypeName) {
                    <span class="meta-chip">{{ upload.cropTypeName }}</span>
                  }
                  @if (upload.propertyName) {
                    <span class="meta-chip">{{ upload.propertyName }}</span>
                  }
                  @if (upload.talhaoName) {
                    <span class="meta-chip">{{ upload.talhaoName }}</span>
                  }
                </div>
              </div>
              <mat-icon class="upload-item-chevron">chevron_right</mat-icon>
            </button>
          } @empty {
            <div class="empty-state">Nenhum upload encontrado.</div>
          }
        </div>
      }
    </mat-card>
  `,
  styles: `
    .sidebar-card {
      padding: 16px;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--agri-surface);
      border: 1px solid var(--agri-border);
      border-radius: 12px;
    }

    .sidebar-header h2 {
      margin: 0 0 4px;
      font-family: 'Bricolage Grotesque', sans-serif;
      font-size: 1.25rem;
      color: var(--agri-text);
    }

    .sidebar-header p {
      margin: 0 0 12px;
      color: var(--agri-text-muted);
      font-size: 0.875rem;
    }

    .search-field {
      width: 100%;
      margin-bottom: 8px;
    }

    .state-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--agri-text-muted);
      min-height: 120px;
    }

    .uploads-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: auto;
      flex: 1;
    }

    .upload-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border: 1px solid var(--agri-border);
      border-radius: 10px;
      background: var(--agri-surface-raised);
      text-align: left;
      padding: 10px 12px;
      cursor: pointer;
      transition:
        border-color 0.15s,
        background 0.15s,
        box-shadow 0.15s;
    }

    .upload-item:hover {
      border-color: var(--agri-accent);
      box-shadow: 0 2px 6px rgba(74, 125, 51, 0.12);
    }

    .upload-item.selected {
      border-color: var(--agri-accent);
      background: var(--agri-fill);
    }

    .upload-item-title {
      font-weight: 600;
      color: var(--agri-text);
      font-size: 0.9375rem;
    }

    .upload-item-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }

    .meta-chip {
      font-size: 11px;
      color: var(--agri-text-muted);
      background: var(--agri-fill-subtle);
      padding: 2px 8px;
      border-radius: 12px;
    }

    .upload-item-chevron {
      color: var(--agri-muted-text);
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .empty-state {
      text-align: center;
      color: var(--agri-text-muted);
      padding: 24px;
      font-size: 0.875rem;
    }
  `,
})
export class UploadSidebarComponent {
  uploads = input<UploadRecord[]>([]);
  selectedUploadId = input<string | null>(null);
  loading = input<boolean>(false);

  selectUpload = output<UploadRecord>();

  readonly filterText = signal('');

  readonly filteredUploads = computed(() => {
    const term = this.filterText().toLowerCase().trim();
    if (!term) {
      return this.uploads();
    }
    return this.uploads().filter(
      (u) =>
        u.id.toLowerCase().includes(term) ||
        (u.propertyName?.toLowerCase().includes(term) ?? false) ||
        (u.cropTypeName?.toLowerCase().includes(term) ?? false),
    );
  });
}
