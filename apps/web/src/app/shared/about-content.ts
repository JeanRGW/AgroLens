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
  { file: 'agraria_logo.svg', label: 'Cooperativa Agrária Agroindustrial' },
  { file: 'capes_logo.png', label: 'CAPES' },
  { file: 'CNPq_logo.svg', label: 'CNPq' },
  {
    file: 'FAPA_logo.png',
    label: 'FAPA — Fundação Agrária de Pesquisa Agropecuária',
  },
  { file: 'FA_logo.png', label: 'Fundação Araucária' },
  { file: 'FundoParana_logo.png', label: 'Fundo Paraná' },
  {
    file: 'SEET_logo.png',
    label: 'Setor de Ciências Exatas e de Tecnologia (SEET) — Unicentro',
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
  'O núcleo de mecanização de agricultura de precisão NMAP da Unicentro oferece mais uma solução na área de tecnologia';

export const PARTNER_INTRO =
  'Desenvolvido com o apoio de instituições de pesquisa e desenvolvimento agrícola, o que contribui para a inovação no setor.';

/** Title of the work as it should be referenced. */
export const CITATION_TITLE =
  'AgroLens: plataforma de captura de imagens de campo, anotação e exportação de conjuntos de dados YOLO para agricultura de precisão.';

/** Authors with the department each one is affiliated with. */
export const CITATION_AUTHORS: readonly string[] = [
  'Jean Rafael Guilouski Wojcik (DECOMP)',
  'Jotair Elio Kwiatkowski Junior (DECOMP)',
  'Leandro Rampim (DEAGRO)',
];

/** Institutions behind each cited department. */
export const CITATION_AFFILIATIONS: readonly string[] = [
  'Departamento de Ciência da Computação (DECOMP) — Setor de Ciências Exatas e de Tecnologia (SEET), Universidade Estadual do Centro-Oeste (Unicentro)',
  'Departamento de Agronomia (DEAGRO) — Universidade Estadual do Centro-Oeste (Unicentro)',
];

/**
 * Software registration at the Brazilian National Institute of Industrial
 * Property. Each registration carries the author list of its own certificate,
 * which is wider than the reference block above.
 */
export const CITATION_REGISTRATION =
  'Software registrado no Instituto Nacional da Propriedade Industrial (INPI), titular: Universidade Estadual do Centro-Oeste (Unicentro).';

export const CITATION_REGISTRATIONS: readonly string[] = [
  'AgroLens — processo nº BR512026002893-0, publicado em 16/04/2026. Autores: Jotair Elio Kwiatkowski Junior; Leandro Rampim; Carlos Eduardo Andrade Iatskiu; Jean Rafael Guilouski Wojcik.',
  'AgroLensWeb — processo nº BR512026009114-4, publicado em 30/06/2026. Autores: Jotair Elio Kwiatkowski Junior; Leandro Rampim; Carlos Eduardo Andrade Iatskiu; Cauã André Conzatti; Jean Rafael Guilouski Wojcik; Vitor Muller Anunciato.',
];

/** Copy-ready citation in ABNT style. */
export const CITATION_ABNT =
  'WOJCIK, Jean Rafael Guilouski; KWIATKOWSKI JUNIOR, Jotair Elio; RAMPIM, Leandro. AgroLens: plataforma de captura de imagens de campo, anotação e exportação de conjuntos de dados YOLO para agricultura de precisão. Guarapuava: Universidade Estadual do Centro-Oeste, 2026. Registro INPI nº BR512026002893-0 (AgroLens) e nº BR512026009114-4 (AgroLensWeb). Disponível em: https://app.agrolens.rgw.app.';

export const APP_URL = 'https://app.agrolens.rgw.app';
