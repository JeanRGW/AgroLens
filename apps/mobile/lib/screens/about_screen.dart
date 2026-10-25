import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../widgets/partner_logos.dart';

/// Copy-ready reference to the AgroLens software, in ABNT style.
const _kCitationAbnt =
    'WOJCIK, Jean Rafael Guilouski; KWIATKOWSKI JUNIOR, Jotair Elio; RAMPIM, '
    'Leandro. AgroLens: plataforma de captura de imagens de campo, anotação, '
    'exportação e inferência para agricultura de precisão. '
    'Guarapuava: Universidade Estadual do Centro-Oeste, 2026. Registro de '
    'programa de computador INPI nº BR512026002893-0. '
    'Disponível em: https://app.agrolens.rgw.app.';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  /// Copies [text] and confirms it, so the reference can be pasted as-is.
  Future<void> _copyCitation(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    await Clipboard.setData(const ClipboardData(text: _kCitationAbnt));
    messenger.showSnackBar(
      const SnackBar(content: Text('Referência copiada.')),
    );
  }

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
                    'Uma solução móvel para coleta, categorização e sincronização de imagens destinadas ao treinamento de modelos de IA. Desenvolvida com tecnologias modernas, permite capturar e enviar imagens e metadados, incluindo informações sobre cultivo e localização.\n\nO sistema oferece sincronização automática na nuvem, suporte à operação offline e organização por culturas, talhões e propriedades. Com uma interface intuitiva e recursos robustos, facilita o processo de coleta de imagens.\n\nO Núcleo de Mecanização e Agricultura de Precisão (NMAP) da Unicentro oferece mais uma solução na área de tecnologia',
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
                  Text(
                    'Referência do software no padrão ABNT (NBR 6023).',
                    style: Theme.of(context).textTheme.bodySmall,
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
                          'Referência',
                          style: Theme.of(context).textTheme.labelLarge
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _kCitationAbnt,
                          style: Theme.of(context).textTheme.bodySmall,
                          textAlign: TextAlign.justify,
                        ),
                        const SizedBox(height: 8),
                        TextButton.icon(
                          onPressed: () => _copyCitation(context),
                          icon: const Icon(Icons.copy_all_outlined, size: 18),
                          label: const Text('Copiar referência'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            child: Text(
              'Para suporte, contate o administrador do sistema.',
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    ),
  );
}
