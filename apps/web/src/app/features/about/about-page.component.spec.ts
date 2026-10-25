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
    expect(text).toContain('BR512026002893-0');
    expect(text).not.toContain('XXXXXX');

    // Reduced block: one reference only, no author/affiliation/registration
    // columns, and the other INPI registration is gone.
    expect(text).not.toContain('BR512026009114-4');
    expect(element.querySelector('.citation-reference')).toBeNull();
    expect(element.querySelector('.author-list')).toBeNull();
    expect(element.querySelector('.affiliation-list')).toBeNull();
    expect(element.querySelector('.column-label')).toBeNull();

    const copy = element.querySelector('app-copy-id-button button') as HTMLButtonElement;
    expect(copy).not.toBeNull();
    expect(copy.getAttribute('aria-label')).toBe('Copiar a referência ABNT');
  });

  it('mentions the NMAP nucleus in the project description', () => {
    const text = render().textContent ?? '';

    expect(text).toContain(
      'O Núcleo de Mecanização e Agricultura de Precisão (NMAP) da Unicentro oferece mais uma solução na área de tecnologia',
    );
  });
});
