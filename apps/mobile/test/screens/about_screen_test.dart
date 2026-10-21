import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/screens/about_screen.dart';

void main() {
  Future<void> pumpAbout(WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: AboutScreen()));
    await tester.pumpAndSettle();
  }

  testWidgets('lists the partner institutions in the agreed order', (
    tester,
  ) async {
    await pumpAbout(tester);

    final order = <String>[];
    for (final widget in tester.allWidgets) {
      if (widget is Image && widget.image is AssetImage) {
        order.add((widget.image as AssetImage).assetName);
      } else if (widget is SvgPicture && widget.bytesLoader is SvgAssetLoader) {
        order.add((widget.bytesLoader as SvgAssetLoader).assetName);
      }
    }

    expect(order, [
      'assets/logo/agronomia_logo.png',
      'assets/logo/BDA_logo.png',
      'assets/logo/CC_logo.png',
      'assets/logo/agraria_logo.svg',
      'assets/logo/capes_logo.png',
      'assets/logo/CNPq_logo.svg',
      'assets/logo/FAPA_logo.png',
      'assets/logo/FA_logo.png',
      'assets/logo/FundoParana_logo.png',
      'assets/logo/SEET_logo.png',
      'assets/logo/LOGO_NMAP_NOVA.png',
      'assets/logo/UNICENTRO_logo.png',
    ]);
  });

  testWidgets('mentions the NMAP nucleus in the project description', (
    tester,
  ) async {
    await pumpAbout(tester);

    expect(
      find.textContaining(
        'O núcleo de mecanização de agricultura de precisão NMAP da Unicentro '
        'oferece mais uma solução na área de tecnologia',
      ),
      findsOneWidget,
    );
  });

  testWidgets('cites the authors, the departments and the INPI registration', (
    tester,
  ) async {
    await pumpAbout(tester);

    expect(find.text('Como citar'), findsOneWidget);
    expect(find.textContaining('Jean Rafael Guilouski Wojcik'), findsWidgets);
    expect(find.textContaining('Jotair Elio Kwiatkowski Junior'), findsWidgets);
    expect(find.textContaining('Leandro Rampim'), findsWidgets);
    expect(
      find.textContaining('Departamento de Ciência da Computação (DECOMP)'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Departamento de Agronomia (DEAGRO)'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Instituto Nacional da Propriedade Industrial'),
      findsOneWidget,
    );
    // Both INPI registrations are cited, in the reference block and in the
    // ABNT line, and no placeholder is left behind.
    expect(find.textContaining('BR512026002893-0'), findsNWidgets(2));
    expect(find.textContaining('BR512026009114-4'), findsNWidgets(2));
    expect(find.textContaining('XXXXXX'), findsNothing);
    expect(
      find.textContaining('WOJCIK, Jean Rafael Guilouski'),
      findsOneWidget,
    );
  });
}
