import { Component, computed, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';

import { AuthService } from '../services/auth.service';
import { map } from 'rxjs';
import { RuntimeConfigService } from '../services/runtime-config.service';
import { OfflineStatusComponent } from '../../shared/components/offline-status.component';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
}

const mainMenu: MenuItem[] = [
  { label: 'Painel', icon: 'dashboard', route: '/dashboard' },
  { label: 'Uploads', icon: 'photo_library', route: '/uploads' },
  { label: 'Anotação', icon: 'crop_free', route: '/labeling' },
  { label: 'Inferência', icon: 'science', route: '/inference' },
];

const collectionMenu: MenuItem[] = [
  { label: 'Novo upload', icon: 'add_photo_alternate', route: '/uploads/new' },
  { label: 'Fila offline', icon: 'sync', route: '/uploads/queue' },
];

const managementMenu: MenuItem[] = [
  { label: 'Propriedades', icon: 'domain', route: '/properties' },
  { label: 'Talhões', icon: 'grid_view', route: '/talhoes' },
  { label: 'Culturas', icon: 'spa', route: '/crops' },
  { label: 'Estádios', icon: 'eco', route: '/estadios' },
];

const adminMenu: MenuItem[] = [
  { label: 'Usuários', icon: 'admin_panel_settings', route: '/admin/users' },
  { label: 'Acessos', icon: 'security', route: '/admin/access' },
  { label: 'Modelos de IA', icon: 'model_training', route: '/admin/inference-models' },
  { label: 'Auditoria', icon: 'history', route: '/admin/audit' },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    OfflineStatusComponent,
  ],
  template: `
    <mat-sidenav-container class="shell-container">
      <mat-sidenav
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile() || sidenavOpened()"
        (closedStart)="sidenavOpened.set(false)"
        class="sidebar"
      >
        <header class="brand">
          <img src="/icons/icon-192.png" alt="AgroLens" class="brand-icon" width="44" height="44" />
          <div>
            <p class="brand-title">AgroLens</p>
            <p class="brand-subtitle">Painel de Controle</p>
          </div>
        </header>

        <mat-nav-list>
          <p class="section-label">Principal</p>

          @for (item of visibleMainMenu(); track item.route) {
            <a
              mat-list-item
              [routerLink]="item.route"
              routerLinkActive="active-link"
              [routerLinkActiveOptions]="{ exact: true }"
              (click)="onNavItemClick()"
            >
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }

          <hr class="section-divider" />

          <p class="section-label">Coleta</p>

          @for (item of collectionMenu; track item.route) {
            <a
              mat-list-item
              [routerLink]="item.route"
              routerLinkActive="active-link"
              [routerLinkActiveOptions]="{ exact: true }"
              (click)="onNavItemClick()"
            >
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }

          <hr class="section-divider" />

          <p class="section-label">Gestão</p>

          @for (item of managementMenu; track item.route) {
            <a
              mat-list-item
              [routerLink]="item.route"
              routerLinkActive="active-link"
              [routerLinkActiveOptions]="{ exact: true }"
              (click)="onNavItemClick()"
            >
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }

          @if (isAdmin()) {
            <hr class="section-divider" />

            <p class="section-label">Administração</p>

            @for (item of visibleAdminMenu(); track item.route) {
              <a
                mat-list-item
                [routerLink]="item.route"
                routerLinkActive="active-link"
                [routerLinkActiveOptions]="{ exact: true }"
                (click)="onNavItemClick()"
              >
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          }
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content>
        <mat-toolbar class="shell-toolbar">
          <div class="toolbar-left">
            @if (isMobile()) {
              <button
                mat-icon-button
                type="button"
                aria-label="Abrir menu de navegação"
                (click)="sidenavOpened.set(true)"
              >
                <mat-icon>menu</mat-icon>
              </button>
            }
          </div>

          <div class="toolbar-right">
            <app-offline-status />
            <div
              class="user-chip"
              (click)="navigateToProfile()"
              (keydown.enter)="navigateToProfile()"
              (keydown.space)="$event.preventDefault(); navigateToProfile()"
              role="button"
              tabindex="0"
            >
              <span class="user-chip-avatar">{{ userInitial() }}</span>
              <div>
                <p class="user-chip-name">{{ userDisplay() }}</p>
                <p class="user-chip-subtitle">Editar perfil</p>
              </div>
            </div>
            <button mat-flat-button color="primary" (click)="logout()">
              <mat-icon>logout</mat-icon>
              Sair
            </button>
          </div>
        </mat-toolbar>

        <main class="shell-content">
          <div class="route-anim-host">
            <router-outlet />
          </div>
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [
    `
      .shell-container {
        height: 100vh;
        height: 100dvh;
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        box-sizing: border-box;
      }

      .sidebar {
        width: 288px;
        padding: 1.2rem 1rem 1rem;
        background: linear-gradient(190deg, #264b2f 0%, #3e6d2d 42%, #7f8f34 100%);
        color: #f8fbee;
        display: flex;
        flex-direction: column;
      }

      .sidebar ::ng-deep .mat-mdc-list-item,
      .sidebar ::ng-deep .mdc-list-item__primary-text,
      .sidebar ::ng-deep .mdc-list-item__start {
        color: #f7fbe9 !important;
      }

      .section-label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #f7fbe9;
        opacity: 1;
        margin: 0.9rem 0 0.3rem;
        padding: 0 0.5rem;
        font-weight: 600;
      }

      .section-divider {
        border: none;
        height: 1px;
        background: rgba(255, 255, 255, 0.15);
        margin: 0.4rem 0;
      }

      .brand {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        margin-bottom: 1.2rem;
      }

      .brand-icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        object-fit: contain;
        flex-shrink: 0;
      }

      .brand-title {
        font-size: 1.05rem;
        margin: 0;
        font-weight: 700;
      }

      .brand-subtitle {
        margin: 0;
        opacity: 0.92;
        font-size: 0.82rem;
      }

      .active-link {
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.18);
      }

      .shell-toolbar {
        height: 72px;
        display: flex;
        justify-content: space-between;
        background: rgba(255, 255, 255, 0.82);
        border-bottom: 1px solid #d7ddbf;
        backdrop-filter: blur(6px);
      }

      .toolbar-right {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .user-chip {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        background: #eef3de;
        border: 1px solid #dce6bd;
        cursor: pointer;
      }

      .user-chip-avatar {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        font-size: 0.85rem;
        font-weight: 700;
        color: #fbfff2;
        background: linear-gradient(140deg, #3f7132 0%, #6d8c35 100%);
      }

      .user-chip-name,
      .user-chip-subtitle {
        margin: 0;
        line-height: 1.15;
      }

      .user-chip-name {
        font-weight: 600;
        font-size: 0.82rem;
      }

      .user-chip-subtitle {
        color: #58733a;
        font-size: 0.72rem;
      }

      .shell-content {
        padding: 1.25rem;
        max-height: calc(100vh - 72px);
        overflow: auto;
      }

      @media (max-width: 980px) {
        .user-chip {
          display: none;
        }
      }

      @media (max-width: 900px) {
        .sidebar {
          width: min(82vw, 320px);
        }

        .shell-toolbar {
          height: 64px;
          padding: 0 0.5rem;
        }

        .shell-content {
          max-height: calc(100vh - 64px);
          padding: 0.75rem;
        }

        .toolbar-right {
          gap: 0.5rem;
        }
      }
    `,
  ],
})
export class AppShellComponent {
  private readonly runtimeConfig = inject(RuntimeConfigService);
  readonly mainMenu = mainMenu.filter((item) => item.route !== '/inference');
  readonly visibleMainMenu = computed(() =>
    this.runtimeConfig.config().inferenceEnabled ? mainMenu : this.mainMenu,
  );
  readonly collectionMenu = collectionMenu;
  readonly managementMenu = managementMenu;
  readonly adminMenu = adminMenu.filter((item) => item.route !== '/admin/inference-models');
  readonly visibleAdminMenu = computed(() =>
    this.runtimeConfig.config().inferenceEnabled ? adminMenu : this.adminMenu,
  );

  protected readonly authService = inject(AuthService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);

  readonly user = this.authService.user;
  readonly isAdmin = this.authService.isAdmin;
  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 900px)').pipe(map((result) => result.matches)),
    { initialValue: false },
  );
  readonly sidenavOpened = signal(false);
  readonly userDisplay = computed(() => this.user()?.fullName || this.user()?.email || 'Usuário');
  readonly userInitial = computed(() => {
    const base = this.user()?.fullName || this.user()?.email || 'U';
    return base.trim().charAt(0).toUpperCase();
  });

  logout(): void {
    void this.authService.logout();
  }

  navigateToProfile(): void {
    void this.router.navigate(['/profile']);
  }

  onNavItemClick(): void {
    if (this.isMobile()) {
      this.sidenavOpened.set(false);
    }
  }
}
