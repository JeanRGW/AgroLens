import 'package:flutter/material.dart';
import '../widgets/partner_logos.dart';

/// Title of the work as it should be referenced.
const _kCitationTitle =
    'AgroLens: plataforma de captura de imagens de campo, anotação e exportação '
    'de conjuntos de dados YOLO para agricultura de precisão.';

/// Authors with the department each one is affiliated with.
const _kCitationAuthors = <String>[
  'Jean Rafael Guilouski Wojcik (DECOMP)',
  'Jotair Elio Kwiatkowski Junior (DECOMP)',
  'Leandro Rampim (DEAGRO)',
];

/// Institutions behind each cited department.
const _kCitationAffiliations = <String>[
  'Departamento de Ciência da Computação (DECOMP) — Setor de Ciências Exatas '
      'e de Tecnologia (SEET), Universidade Estadual do Centro-Oeste '
      '(Unicentro)',
  'Departamento de Agronomia (DEAGRO) — Universidade Estadual do '
      'Centro-Oeste (Unicentro)',
];

/// Software registration at the Brazilian National Institute of Industrial
/// Property. The registrations list their own author lists, which are wider
/// than the reference block above.
const _kCitationRegistration =
    'Software registrado no Instituto Nacional da Propriedade Industrial '
    '(INPI), titular: Universidade Estadual do Centro-Oeste (Unicentro).';

/// One line per INPI certificate, with the authors each one names.
const _kCitationRegistrations = <String>[
  'AgroLens — processo nº BR512026002893-0, publicado em 16/04/2026. '
      'Autores: Jotair Elio Kwiatkowski Junior; Leandro Rampim; Carlos Eduardo '
      'Andrade Iatskiu; Jean Rafael Guilouski Wojcik.',
  'AgroLensWeb — processo nº BR512026009114-4, publicado em 30/06/2026. '
      'Autores: Jotair Elio Kwiatkowski Junior; Leandro Rampim; Carlos Eduardo '
      'Andrade Iatskiu; Cauã André Conzatti; Jean Rafael Guilouski Wojcik; '
      'Vitor Muller Anunciato.',
];

/// Copy-ready citation in ABNT style.
const _kCitationAbnt =
    'WOJCIK, Jean Rafael Guilouski; KWIATKOWSKI JUNIOR, Jotair Elio; RAMPIM, '
    'Leandro. AgroLens: plataforma de captura de imagens de campo, anotação e '
    'exportação de conjuntos de dados YOLO para agricultura de precisão. '
    'Guarapuava: Universidade Estadual do Centro-Oeste, 2026. Registro INPI nº '
    'BR512026002893-0 (AgroLens) e nº BR512026009114-4 (AgroLensWeb). '
    'Disponível em: https://app.agrolens.rgw.app.';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Sobre')),
    body: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sobre o projeto',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Theme.of(
                          context,
                        ).colorScheme.primary.withValues(alpha: .08),
                        Theme.of(
                          context,
                        ).colorScheme.secondary.withValues(alpha: .08),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: Theme.of(
                        context,
                      ).colorScheme.primary.withValues(alpha: .1),
                    ),
                  ),
                  child: const Text(
                    'Uma solução móvel para coleta, categorização e sincronização de imagens destinadas ao treinamento de modelos de IA. Desenvolvida com tecnologias modernas, permite capturar e enviar imagens e metadados, incluindo informações sobre cultivo e localização.\n\nO sistema oferece sincronização automática na nuvem, suporte à operação offline e organização por culturas, talhões e propriedades. Com uma interface intuitiva e recursos robustos, facilita o processo de coleta de imagens.\n\nO núcleo de mecanização de agricultura de precisão NMAP da Unicentro oferece mais uma solução na área de tecnologia',
                    style: TextStyle(height: 1.6),
                    textAlign: TextAlign.justify,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Instituições parceiras',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: Theme.of(
                        context,
                      ).colorScheme.outline.withValues(alpha: .2),
                    ),
                    boxShadow: const [
                      BoxShadow(
                        color: Colors.black12,
                        blurRadius: 8,
                        offset: Offset(0, 3),
                      ),
                    ],
                  ),
                  child: const Text(
                    'Desenvolvido com o apoio de instituições de pesquisa e desenvolvimento agrícola, o que contribui para a inovação no setor.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            // Fixed three-column grid so the partner lineup always reads in
            // the same order, whatever the phone width.
            child: GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: EdgeInsets.zero,
              crossAxisSpacing: 16,
              mainAxisSpacing: 24,
              childAspectRatio: 110 / 60,
              children: kPartnerLogos
                  .map(
                    (name) => Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.black12),
                      ),
                      child: buildPartnerLogo(name),
                    ),
                  )
                  .toList(),
            ),
          ),
          const SizedBox(height: 30),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text(
              'Como citar',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: Theme.of(
                    context,
                  ).colorScheme.outline.withValues(alpha: .2),
                ),
                boxShadow: const [
                  BoxShadow(
                    color: Colors.black12,
                    blurRadius: 8,
                    offset: Offset(0, 3),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    _kCitationTitle,
                    style: TextStyle(fontWeight: FontWeight.w700),
                    textAlign: TextAlign.justify,
                  ),
                  const SizedBox(height: 12),
                  for (final author in _kCitationAuthors)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(author),
                    ),
                  const SizedBox(height: 8),
                  for (final affiliation in _kCitationAffiliations)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        affiliation,
                        style: Theme.of(context).textTheme.bodySmall,
                        textAlign: TextAlign.justify,
                      ),
                    ),
                  const SizedBox(height: 8),
                  Text(
                    _kCitationRegistration,
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.justify,
                  ),
                  const SizedBox(height: 8),
                  for (final registration in _kCitationRegistrations)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        registration,
                        style: Theme.of(context).textTheme.bodySmall,
                        textAlign: TextAlign.justify,
                      ),
                    ),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(
                        context,
                      ).colorScheme.primary.withValues(alpha: .05),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Formato ABNT',
                          style: Theme.of(context).textTheme.labelLarge
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _kCitationAbnt,
                          style: Theme.of(context).textTheme.bodySmall,
                          textAlign: TextAlign.justify,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 30, 20, 12),
            child: Text(
              'https://app.agrolens.rgw.app',
              textAlign: TextAlign.center,
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: Text(
              'Para suporte, contate o administrador do sistema.',
              textAlign: TextAlign.center,
            ),
          ),
          const Center(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Text('Desenvolvido em 2026'),
            ),
          ),
        ],
      ),
    ),
  );
}
