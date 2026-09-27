import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { UploadsService } from '../../core/services/uploads.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DashboardSnapshot, UploadRecord } from '../../shared/models/upload-record';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    MatSnackBarModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    DatePipe,
    DecimalPipe,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit {
  private readonly uploadsService = inject(UploadsService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly snapshot = signal<DashboardSnapshot | null>(null);

  /** In-memory cache of preview signed URLs keyed by "uploadId:fileId". */
  private readonly previewCache = signal<Map<string, string>>(new Map());

  /** Set of keys for which a preview URL fetch is already in flight. */
  private readonly inflightPreviews = new Set<string>();

  ngOnInit(): void {
    void this.refresh();
  }

  /**
   * Return the cached preview URL for a record, or null if not yet loaded.
   */
  previewUrl(record: UploadRecord): string | null {
    if (!record.previewFileId) return null;
    const key = `${record.id}:${record.previewFileId}`;
    return this.previewCache().get(key) ?? null;
  }

  /**
   * Called when a preview <img> fails to load. Removes the URL from cache
   * so the placeholder icon is shown instead.
   */
  onPreviewError(record: UploadRecord): void {
    if (!record.previewFileId) return;
    const key = `${record.id}:${record.previewFileId}`;
    this.previewCache.update((map) => {
      const next = new Map(map);
      next.delete(key);
      return next;
    });
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.uploadsService.getDashboardSnapshot();
      this.snapshot.set(result);
      this.fetchPreviewUrls(result.recentUploads);
    } catch {
      this.snapshot.set(null);
      this.snackBar.open('Falha ao carregar o painel.', 'Fechar', { duration: 6000 });
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Fetch signed preview URLs for any recent uploads that have a previewFileId
   * but are not yet in the cache. Runs fire-and-forget — the template
   * reactively picks up new URLs via the previewCache signal.
   */
  private fetchPreviewUrls(records: UploadRecord[]): void {
    const cache = this.previewCache();
    for (const record of records) {
      if (!record.previewFileId) continue;
      const key = `${record.id}:${record.previewFileId}`;
      if (cache.has(key) || this.inflightPreviews.has(key)) continue;
      this.inflightPreviews.add(key);
      this.uploadsService
        .getPreviewUrl(record.id, record.previewFileId)
        .then((res) => {
          this.previewCache.update((map) => {
            const next = new Map(map);
            next.set(key, res.downloadUrl);
            return next;
          });
        })
        .catch(() => {
          // Silently ignore — placeholder icon remains visible
        })
        .finally(() => {
          this.inflightPreviews.delete(key);
        });
    }
  }
}
