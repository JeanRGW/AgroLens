import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { inferenceEnabledGuard } from './core/guards/inference-enabled.guard';
import type { LabelingPageComponent } from './features/labeling/labeling-page.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register-page.component').then((m) => m.RegisterPageComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password-page.component').then(
        (m) => m.ForgotPasswordPageComponent,
      ),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password-page.component').then(
        (m) => m.ResetPasswordPageComponent,
      ),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/layout/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page.component').then(
            (m) => m.DashboardPageComponent,
          ),
      },
      {
        path: 'uploads',
        loadComponent: () =>
          import('./features/uploads/uploads-list-page.component').then(
            (m) => m.UploadsListPageComponent,
          ),
      },
      {
        path: 'uploads/new',
        loadComponent: () =>
          import('./features/uploads/upload-create-page.component').then(
            (m) => m.UploadCreatePageComponent,
          ),
      },
      {
        path: 'uploads/queue',
        loadComponent: () =>
          import('./features/uploads/offline-upload-queue-page.component').then(
            (m) => m.OfflineUploadQueuePageComponent,
          ),
      },
      {
        path: 'uploads/:id',
        loadComponent: () =>
          import('./features/uploads/upload-detail-page.component').then(
            (m) => m.UploadDetailPageComponent,
          ),
      },
      {
        path: 'labeling',
        canDeactivate: [(component: LabelingPageComponent) => component.canDeactivate()],
        loadComponent: () =>
          import('./features/labeling/labeling-page.component').then(
            (m) => m.LabelingPageComponent,
          ),
      },
      {
        path: 'inference',
        canMatch: [inferenceEnabledGuard],
        loadComponent: () =>
          import('./features/inference/inference-page.component').then(
            (m) => m.InferencePageComponent,
          ),
      },
      {
        path: 'inference/:jobId',
        canMatch: [inferenceEnabledGuard],
        loadComponent: () =>
          import('./features/inference/inference-viewer-page.component').then(
            (m) => m.InferenceViewerPageComponent,
          ),
      },
      {
        path: 'properties',
        loadComponent: () =>
          import('./features/metadata/properties-page.component').then(
            (m) => m.PropertiesPageComponent,
          ),
      },
      {
        path: 'talhoes',
        loadComponent: () =>
          import('./features/metadata/talhoes-page.component').then((m) => m.TalhoesPageComponent),
      },
      {
        path: 'crops',
        loadComponent: () =>
          import('./features/metadata/crops-page.component').then((m) => m.CropsPageComponent),
      },
      {
        path: 'estadios',
        loadComponent: () =>
          import('./features/metadata/estadios-page.component').then(
            (m) => m.EstadiosPageComponent,
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile-page.component').then((m) => m.ProfilePageComponent),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        children: [
          {
            path: 'users',
            loadComponent: () =>
              import('./features/admin/users-admin-page.component').then(
                (m) => m.UsersAdminPageComponent,
              ),
          },
          {
            path: 'access',
            loadComponent: () =>
              import('./features/admin/access-admin-page.component').then(
                (m) => m.AccessAdminPageComponent,
              ),
          },
          {
            path: 'audit',
            loadComponent: () =>
              import('./features/admin/audit-admin-page.component').then(
                (m) => m.AuditAdminPageComponent,
              ),
          },
          {
            path: 'inference-models',
            canMatch: [inferenceEnabledGuard],
            loadComponent: () =>
              import('./features/admin/inference-models-page.component').then(
                (m) => m.InferenceModelsPageComponent,
              ),
          },
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'users',
          },
        ],
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
