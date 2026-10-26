/**
 * Content shown by the "Sobre" page: the project description, the partner
 * institutions and how to cite the work.
 *
 * The wording is shared with the Flutter "Sobre" screen
 * (apps/mobile/lib/screens/about_screen.dart) — keep both in sync.
 */

export interface PartnerLogo {
  /** File name under `public/logos/`. */
  readonly file: string;
  /** Institution name, used as the image alternative text. */
  readonly label: string;
}

export const PARTNER_LOGOS: readonly PartnerLogo[] = [
  { file: 'agronomia_logo.png', label: 'Agronomia — Unicentro' },
  { file: 'BDA_logo.png', label: 'Big Data Analytics' },
  { file: 'CC_logo.png', label: 'Ciência da Computação' },
  {
    file: 'seti_logo.png',
    label: 'Secretaria da Ciência, Tecnologia e Ensino Superior (SETI) — Paraná',
  },
  { file: 'FA_logo.png', label: 'Fundação Araucária' },
  { file: 'FundoParana_logo.png', label: 'Fundo Paraná' },
  { file: 'agraria_logo.svg', label: 'Cooperativa Agrária Agroindustrial' },
  { file: 'capes_logo.png', label: 'CAPES' },
  { file: 'CNPq_logo.svg', label: 'CNPq' },
  {
    file: 'FAPA_logo.png',
    label: 'FAPA — Fundação Agrária de Pesquisa Agropecuária',
  },
  {
    file: 'LOGO_NMAP_NOVA.png',
    label: 'Núcleo de Mecanização e Agricultura de Precisão (NMAP) — Unicentro',
  },
  { file: 'UNICENTRO_logo.png', label: 'Unicentro' },
];

export const PROJECT_DESCRIPTION = [
  'Uma solução móvel para coleta, categorização e sincronização de imagens destinadas ao treinamento de modelos de IA. Desenvolvida com tecnologias modernas, permite capturar e enviar imagens e metadados, incluindo informações sobre cultivo e localização.',
  'O sistema oferece sincronização automática na nuvem, suporte à operação offline e organização por culturas, talhões e propriedades. Com uma interface intuitiva e recursos robustos, facilita o processo de coleta de imagens.',
];

/** Closing statement about the NMAP nucleus, set apart from the narrative. */
export const PROJECT_NOTE =
  'O Núcleo de Mecanização e Agricultura de Precisão (NMAP) da Unicentro oferece mais uma solução na área de tecnologia';

export const PARTNER_INTRO =
  'Desenvolvido com o apoio de instituições de pesquisa e desenvolvimento agrícola, o que contribui para a inovação no setor.';

/**
 * Software registrations at the National Institute of Industrial Property,
 * shown discreetly in the page footer rather than inside the reference.
 */
export const INPI_REGISTRATIONS: readonly { product: string; number: string }[] = [
  { product: 'AgroLens', number: 'BR512026002893-0' },
  { product: 'AgroLensWeb', number: 'BR512026009114-4' },
];

/** Copy-ready reference to the AgroLens software, in ABNT style. */
export const CITATION_ABNT =
  'WOJCIK, Jean Rafael Guilouski; KWIATKOWSKI JUNIOR, Jotair Elio; RAMPIM, Leandro. AgroLens: plataforma de captura de imagens de campo, anotação, exportação e inferência para agricultura de precisão. Guarapuava: Universidade Estadual do Centro-Oeste, 2026. Disponível em: https://app.agrolens.rgw.app.';
