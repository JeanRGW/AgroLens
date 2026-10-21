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

  it('cites the authors, the departments and both INPI registrations', () => {
    const text = render().textContent ?? '';

    expect(text).toContain('Como citar');
    expect(text).toContain('Jean Rafael Guilouski Wojcik (DECOMP)');
    expect(text).toContain('Jotair Elio Kwiatkowski Junior (DECOMP)');
    expect(text).toContain('Leandro Rampim (DEAGRO)');
    expect(text).toContain('Departamento de Ciência da Computação (DECOMP)');
    expect(text).toContain('Departamento de Agronomia (DEAGRO)');
    expect(text).toContain('Instituto Nacional da Propriedade Industrial');
    expect(text).toContain('BR512026002893-0');
    expect(text).toContain('BR512026009114-4');
    expect(text).not.toContain('XXXXXX');
    expect(text).toContain('WOJCIK, Jean Rafael Guilouski');
  });

  it('mentions the NMAP nucleus in the project description', () => {
    const text = render().textContent ?? '';

    expect(text).toContain(
      'O núcleo de mecanização de agricultura de precisão NMAP da Unicentro oferece mais uma solução na área de tecnologia',
    );
  });
});
