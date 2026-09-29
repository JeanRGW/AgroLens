import 'package:flutter/material.dart';

class CustomScaffold extends StatelessWidget {
  final Widget body;
  final PreferredSizeWidget? appBar;
  final Widget? floatingActionButton;
  final Widget? bottomNavigationBar;
  final bool returnToPrevious;
  final String? title;
  final List<Widget>? actions;
  final bool hasAppBar;

  const CustomScaffold({
    super.key,
    required this.body,
    this.appBar,
    this.floatingActionButton,
    this.bottomNavigationBar,
    this.returnToPrevious = false,
    this.title,
    this.actions,
    this.hasAppBar = true,
  });

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar:
        appBar ??
        (hasAppBar
            ? AppBar(
                title: Text(title ?? 'AgroLens'),
                centerTitle: true,
                leading: returnToPrevious
                    ? IconButton(
                        icon: const Icon(Icons.arrow_back),
                        tooltip: 'Voltar',
                        onPressed: () => Navigator.of(context).pop(),
                      )
                    : null,
                actions: actions,
                backgroundColor: Theme.of(context).colorScheme.primary,
              )
            : null),
    body: body,
    floatingActionButton: floatingActionButton,
    bottomNavigationBar: bottomNavigationBar,
  );
}
