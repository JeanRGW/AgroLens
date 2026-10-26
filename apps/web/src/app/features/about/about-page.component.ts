import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { CopyIdButtonComponent } from '../../shared/components/copy-id-button.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import {
  CITATION_ABNT,
  INPI_REGISTRATIONS,
  PARTNER_INTRO,
  PARTNER_LOGOS,
  PROJECT_DESCRIPTION,
  PROJECT_NOTE,
} from '../../shared/about-content';

@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [MatCardModule, MatIconModule, PageHeaderComponent, CopyIdButtonComponent],
  templateUrl: './about-page.component.html',
  styleUrl: './about-page.component.scss',
})
export class AboutPageComponent {
  readonly partnerLogos = PARTNER_LOGOS;
  readonly description = PROJECT_DESCRIPTION;
  readonly note = PROJECT_NOTE;
  readonly partnerIntro = PARTNER_INTRO;
  readonly citationAbnt = CITATION_ABNT;
  readonly inpiRegistrations = INPI_REGISTRATIONS;
}
