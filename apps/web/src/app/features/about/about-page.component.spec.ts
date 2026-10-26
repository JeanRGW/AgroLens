import { TestBed } from '@angular/core/testing';
import { AboutPageComponent } from './about-page.component';
import { PARTNER_LOGOS } from '../../shared/about-content';

describe('AboutPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AboutPageComponent] }).compileComponents();
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(AboutPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists the partner institutions in the agreed order', () => {
    const images = Array.from(render().querySelectorAll('.logo-grid img')) as HTMLImageElement[];

    expect(images.map((image) => image.getAttribute('src'))).toEqual(
      PARTNER_LOGOS.map((logo) => `logos/${logo.file}`),
    );
  });

  it('labels every partner logo for assistive technology', () => {
    const images = Array.from(render().querySelectorAll('.logo-grid img')) as HTMLImageElement[];

    expect(images.map((image) => image.getAttribute('alt'))).toEqual(
      PARTNER_LOGOS.map((logo) => logo.label),
    );
    expect(images.every((image) => (image.getAttribute('alt') ?? '').length > 0)).toBeTrue();
  });

  it('shows a single copy-ready ABNT reference to the software', () => {
    const element = render();
    const text = element.textContent ?? '';

    expect(text).toContain('Como citar');
    expect(text).toContain('WOJCIK, Jean Rafael Guilouski');
    expect(text).toContain('KWIATKOWSKI JUNIOR, Jotair Elio');
    expect(text).toContain('RAMPIM, Leandro');
    expect(text).toContain('AgroLens: plataforma');
    expect(text).toContain('Universidade Estadual do Centro-Oeste, 2026');
    expect(text).toContain('Disponível em: https://app.agrolens.rgw.app.');
    expect(text).not.toContain('XXXXXX');

    // The reference cites the software itself, not an INPI certificate: no
    // registration number and no access date inside the reference.
    const reference = element.querySelector('.abnt-text')?.textContent ?? '';
    expect(reference).not.toContain('INPI');
    expect(reference).not.toContain('BR512026');
    expect(reference).not.toContain('Acesso em');

    // Reduced block: one reference only, no author/affiliation columns.
    expect(element.querySelector('.citation-reference')).toBeNull();
    expect(element.querySelector('.author-list')).toBeNull();
    expect(element.querySelector('.affiliation-list')).toBeNull();
    expect(element.querySelector('.column-label')).toBeNull();

    const copy = element.querySelector('app-copy-id-button button') as HTMLButtonElement;
    expect(copy).not.toBeNull();
    expect(copy.getAttribute('aria-label')).toBe('Copiar a referência ABNT');
  });

  it('credits both INPI registrations discreetly in the footer', () => {
    const element = render();
    const footer = element.querySelector('.page-footer')?.textContent ?? '';
    const reference = element.querySelector('.abnt-text')?.textContent ?? '';

    for (const number of ['BR512026002893-0', 'BR512026009114-4']) {
      expect(footer).toContain(number);
      expect(reference).not.toContain(number);
    }
    expect(footer).toContain('AgroLensWeb');
    expect(footer).toContain('Registros de programa de computador no INPI.');
    expect(footer).toContain('Para suporte, contate o administrador do sistema.');
  });

  it('mentions the NMAP nucleus in the project description', () => {
    const text = render().textContent ?? '';

    expect(text).toContain(
      'O Núcleo de Mecanização e Agricultura de Precisão (NMAP) da Unicentro oferece mais uma solução na área de tecnologia',
    );
  });
});
