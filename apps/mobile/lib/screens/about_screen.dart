import 'package:flutter/material.dart';
import '../widgets/partner_logos.dart';

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
                    'Uma solução móvel para coleta, categorização e sincronização de imagens destinadas ao treinamento de modelos de IA. Desenvolvida com tecnologias modernas, permite capturar e enviar imagens e metadados, incluindo informações sobre cultivo e localização.\n\nO sistema oferece sincronização automática na nuvem, suporte à operação offline e organização por culturas, talhões e propriedades. Com uma interface intuitiva e recursos robustos, facilita o processo de coleta de imagens.',
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
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: 16,
              runSpacing: 24,
              children: kPartnerLogos
                  .map(
                    (name) => Container(
                      width: 110,
                      height: 60,
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
