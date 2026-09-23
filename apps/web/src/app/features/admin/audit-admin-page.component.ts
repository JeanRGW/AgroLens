import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';

import { AuditService } from '../../core/services/audit.service';
import { ExportService } from '../../core/services/export.service';
import { AuditEvent, AuditEventType } from '@agrolens/contracts';
import { AuditFilters } from '../../core/services/audit.service';
import { RESOURCE_TYPES, ResourceType } from '@agrolens/contracts';
import { RESOURCE_LABELS } from '../../shared/labels';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { AuditChangesDialogComponent } from '../../shared/components/audit-changes-dialog.component';
import { summarizeChanges } from '../../shared/utils/audit-changes';
import { CopyIdButtonComponent } from '../../shared/components/copy-id-button.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';

@Component({
  selector: 'app-audit-admin-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSnackBarModule,
    DatePipe,
    CopyIdButtonComponent,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './audit-admin-page.component.html',
  styleUrl: './audit-admin-page.component.scss',
})
export class AuditAdminPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private eventsRequest = 0;
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  private readonly auditService = inject(AuditService);
  private readonly exportService = inject(ExportService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly events = signal<AuditEvent[]>([]);
  readonly total = signal(0);
  readonly currentPage = signal(1);

  readonly resourceTypes = RESOURCE_TYPES;
  readonly resourceLabels = RESOURCE_LABELS;

  readonly displayedColumns = [
    'eventType',
    'actorUid',
    'targetUid',
    'resource',
    'createdAt',
    'changes',
  ];

  readonly eventTypes: AuditEventType[] = [
    'access_grant',
    'access_revoke',
    'role_change',
    'display_urls_issued',
    'download_url_issued',
    'export_urls_issued',
    'upload_deleted',
    'model_init',
    'model_complete',
    'model_update',
    'model_activate',
    'model_deactivate',
    'model_delete',
    'job_create',
    'job_delete',
  ];

  readonly filtersForm = this.fb.nonNullable.group({
    eventType: ['' as AuditEventType | ''],
    actorUserId: [''],
    targetUserId: [''],
    resourceType: ['' as ResourceType | ''],
    resourceId: [''],
    dateFrom: [''],
    dateTo: [''],
    pageSize: [50],
  });

  readonly totalPages = computed(() => {
    const pageSize = this.filtersForm.controls.pageSize.value;
    return Math.max(1, Math.ceil(this.total() / pageSize));
  });

  ngOnInit(): void {
    this.filtersForm.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.currentPage.set(1);
        void this.loadEvents();
      });

    void this.loadEvents();
  }

  async loadEvents(): Promise<void> {
    const request = ++this.eventsRequest;
    this.loading.set(true);

    try {
      const filtersValue = this.filtersForm.getRawValue();
      const filters = this.buildFilters(filtersValue);

      const result = await this.auditService.listEvents(filters);
      if (request !== this.eventsRequest || this.destroyRef.destroyed) return;
      this.events.set(result.events);
      this.total.set(result.total);
    } catch {
      if (request !== this.eventsRequest || this.destroyRef.destroyed) return;
      this.snackBar.open('Falha ao carregar eventos de auditoria.', 'Fechar', { duration: 3400 });
    } finally {
      if (request === this.eventsRequest) this.loading.set(false);
    }
  }

  async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    await this.loadEvents();
  }

  async exportCsv(): Promise<void> {
    this.exporting.set(true);

    try {
      const recordsToExport = this.events().map((e) => ({
        eventType: e.eventType,
        actorUserId: e.actorUserId,
        actorName: e.actorName || '',
        targetUserId: e.targetUserId || '',
        targetName: e.targetName || '',
        resourceType: e.resourceType || '',
        resourceId: e.resourceId || '',
        createdAt: e.createdAt || '',
        before: e.before ? JSON.stringify(e.before) : '',
        after: e.after ? JSON.stringify(e.after) : '',
      }));
      this.exportService.exportGenericCsv(recordsToExport, `audit-access-${Date.now()}`);
    } catch {
      this.snackBar.open('Não foi possível exportar o CSV.', 'Fechar', {
        duration: 3200,
      });
    } finally {
      this.exporting.set(false);
    }
  }

  userLabel(uid?: string, name?: string): string {
    const normalized = `${uid ?? ''}`.trim();
    if (!normalized) return '-';
    return name || normalized;
  }

  resourceTypeLabel(event: AuditEvent): string {
    if (!event.resourceType) return '';
    if (event.resourceType === 'upload_file') {
      return this.resourceLabels['upload'];
    }
    return this.resourceLabels[event.resourceType] ?? event.resourceType;
  }

  eventLabel(eventType: string): string {
    const labels: Record<string, string> = {
      access_grant: 'Concessão de acesso',
      access_revoke: 'Revogação de acesso',
      role_change: 'Papel alterado',
      display_urls_issued: 'URLs de exibição emitidas',
      download_url_issued: 'URL de download emitida',
      export_urls_issued: 'URLs de exportação emitidas',
      upload_deleted: 'Upload removido',
      model_init: 'Modelo inicializado',
      model_complete: 'Modelo concluído',
      model_update: 'Modelo atualizado',
      model_activate: 'Modelo ativado',
      model_deactivate: 'Modelo desativado',
      model_delete: 'Modelo removido',
      job_create: 'Inferência criada',
      job_delete: 'Inferência removida',
    };
    return labels[eventType] || eventType;
  }

  changeSummary(event: AuditEvent): string {
    return summarizeChanges(event.before, event.after);
  }

  hasDetails(event: AuditEvent): boolean {
    return this.changeSummary(event) !== '–' || Object.keys(event.metadata ?? {}).length > 0;
  }

  cellLabel(event: AuditEvent): string {
    const summary = this.changeSummary(event);
    return summary !== '–' ? summary : 'Ver detalhes';
  }

  openChanges(event: AuditEvent): void {
    this.dialog.open(AuditChangesDialogComponent, {
      data: {
        eventLabel: this.eventLabel(event.eventType),
        createdAt: event.createdAt,
        before: event.before ?? {},
        after: event.after ?? {},
        metadata: event.metadata,
      },
      maxWidth: '760px',
      width: '100%',
    });
  }

  private buildFilters(filtersValue: {
    eventType: AuditEventType | '';
    actorUserId: string;
    targetUserId: string;
    resourceType: ResourceType | '';
    resourceId: string;
    dateFrom: string;
    dateTo: string;
    pageSize: number;
  }): AuditFilters {
    const filters: AuditFilters = {
      page: this.currentPage(),
      pageSize: filtersValue.pageSize,
    };

    if (filtersValue.eventType) {
      filters.eventType = filtersValue.eventType;
    }

    if (filtersValue.actorUserId.trim()) {
      filters.actorUserId = filtersValue.actorUserId.trim();
    }

    if (filtersValue.targetUserId.trim()) {
      filters.targetUserId = filtersValue.targetUserId.trim();
    }

    if (filtersValue.resourceType) {
      filters.resourceType = filtersValue.resourceType;
    }

    if (filtersValue.resourceId.trim()) {
      filters.resourceId = filtersValue.resourceId.trim();
    }

    if (filtersValue.dateFrom) {
      filters.dateFrom = new Date(`${filtersValue.dateFrom}T00:00:00`).toISOString();
    }

    if (filtersValue.dateTo) {
      filters.dateTo = new Date(`${filtersValue.dateTo}T23:59:59.999`).toISOString();
    }

    return filters;
  }
}
