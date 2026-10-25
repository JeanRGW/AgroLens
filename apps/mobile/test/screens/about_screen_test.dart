import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
      'assets/logo/seti_logo.png',
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
        'O Núcleo de Mecanização e Agricultura de Precisão (NMAP) da Unicentro '
        'oferece mais uma solução na área de tecnologia',
      ),
      findsOneWidget,
    );
  });

  testWidgets('shows a single copy-ready ABNT reference to the software', (
    tester,
  ) async {
    await pumpAbout(tester);

    expect(find.text('Como citar'), findsOneWidget);
    // The reference names the authors, the software, the institution, the INPI
    // registration and the access date, and no placeholder is left behind.
    expect(
      find.textContaining('WOJCIK, Jean Rafael Guilouski'),
      findsOneWidget,
    );
    expect(
      find.textContaining('KWIATKOWSKI JUNIOR, Jotair Elio'),
      findsOneWidget,
    );
    expect(find.textContaining('RAMPIM, Leandro'), findsOneWidget);
    expect(find.textContaining('AgroLens: plataforma'), findsOneWidget);
    expect(
      find.textContaining('Universidade Estadual do Centro-Oeste, 2026'),
      findsOneWidget,
    );
    expect(find.textContaining('BR512026002893-0'), findsOneWidget);
    expect(find.textContaining('XXXXXX'), findsNothing);
    expect(find.text('Copiar referência'), findsOneWidget);
  });

  testWidgets('copies the reference to the clipboard', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied = (call.arguments as Map)['text'] as String;
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );

    await pumpAbout(tester);
    final copy = find.text('Copiar referência');
    await tester.ensureVisible(copy);
    await tester.pumpAndSettle();
    await tester.tap(copy);
    await tester.pump();

    expect(copied, startsWith('WOJCIK, Jean Rafael Guilouski'));
    expect(copied, contains('BR512026002893-0'));
  });
}
