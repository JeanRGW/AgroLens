import 'package:flutter/material.dart';

/// Shared search box for catalog list and detail screens.
class CatalogSearchField extends StatelessWidget {
  final TextEditingController controller;
  final String hintText;
  final VoidCallback onChanged;

  const CatalogSearchField({
    super.key,
    required this.controller,
    required this.hintText,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    decoration: InputDecoration(
      hintText: hintText,
      prefixIcon: const Icon(Icons.search),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      suffixIcon: controller.text.isEmpty
          ? null
          : IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () {
                controller.clear();
                onChanged();
              },
            ),
    ),
    onChanged: (_) => onChanged(),
  );
}

/// Shared "N de M" count banner shown above catalog lists.
class CatalogCountBanner extends StatelessWidget {
  final IconData icon;
  final String text;
  final double iconSpacing;
  final bool singleLine;

  const CatalogCountBanner({
    super.key,
    required this.icon,
    required this.text,
    this.iconSpacing = 10,
    this.singleLine = false,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.primaryContainer,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        Icon(icon, color: Colors.white),
        SizedBox(width: iconSpacing),
        Expanded(
          child: Text(
            text,
            maxLines: singleLine ? 1 : null,
            overflow: singleLine ? TextOverflow.ellipsis : null,
            style: const TextStyle(color: Colors.white),
          ),
        ),
      ],
    ),
  );
}

/// Resolves the loading/error/empty ladder shared by catalog list screens.
/// Spreads its result into the list's children; [items] is evaluated only
/// when the list itself is shown.
List<Widget> catalogListChildren({
  required bool loading,
  required String? error,
  required String errorTitle,
  required VoidCallback onRetry,
  required bool listIsEmpty,
  required IconData emptyIcon,
  required String emptyTitle,
  required String emptyMessage,
  String? emptyActionLabel,
  VoidCallback? emptyAction,
  required List<Widget> Function() items,
}) {
  if (loading) {
    return const [
      Padding(
        padding: EdgeInsets.only(top: 80),
        child: Center(child: CircularProgressIndicator()),
      ),
    ];
  }
  if (error != null) {
    return [
      CatalogStateMessage(
        icon: Icons.error_outline,
        title: errorTitle,
        message: error,
        actionLabel: 'Tentar novamente',
        onAction: onRetry,
      ),
    ];
  }
  if (listIsEmpty) {
    return [
      CatalogStateMessage(
        icon: emptyIcon,
        title: emptyTitle,
        message: emptyMessage,
        actionLabel: emptyActionLabel,
        onAction: emptyAction,
      ),
    ];
  }
  return items();
}

/// Confirmation dialog shared by destructive catalog and cloud actions.
Future<bool> confirmDestructiveAction(
  BuildContext context, {
  required String title,
  required String message,
  String cancelLabel = 'Cancelar',
  String confirmLabel = 'Excluir',
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: Text(cancelLabel),
        ),
        FilledButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return confirmed == true;
}

/// Shared saving state and submit flow for catalog create/edit forms.
mixin CatalogFormSaveMixin<T extends StatefulWidget> on State<T> {
  bool saving = false;
  String? saveError;

  Future<void> saveCatalogForm<I>(
    GlobalKey<FormState> formKey, {
    required Future<I> Function() action,
    required String failureMessage,
  }) async {
    if (!formKey.currentState!.validate()) return;

    setState(() {
      saving = true;
      saveError = null;
    });

    try {
      final result = await action();
      if (!mounted) return;
      Navigator.of(context).pop(result);
    } catch (e) {
      if (!mounted) return;
      setState(() => saveError = failureMessage);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(failureMessage)));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}

class CompactCatalogButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final IconData icon;
  final String label;

  const CompactCatalogButton({
    super.key,
    required this.onPressed,
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        tapTargetSize: MaterialTapTargetSize.padded,
        visualDensity: VisualDensity.standard,
      ),
      icon: Icon(icon, size: 16),
      label: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
    );
  }
}

class CatalogAction {
  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  const CatalogAction({
    required this.label,
    required this.icon,
    required this.onPressed,
  });
}

class CatalogActionRow extends StatelessWidget {
  final List<CatalogAction> actions;

  const CatalogActionRow({super.key, required this.actions});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final action in actions)
          CompactCatalogButton(
            onPressed: action.onPressed,
            icon: action.icon,
            label: action.label,
          ),
      ],
    );
  }
}

void showPendingSyncBlockedMessage(BuildContext context) {
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(
      content: Text(
        'Este item foi criado offline e ainda não foi sincronizado. Aguarde a sincronização para editar.',
      ),
    ),
  );
}

class CatalogDetailRow extends StatelessWidget {
  final String label;
  final String value;

  const CatalogDetailRow({super.key, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

class CatalogStateMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const CatalogStateMessage({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 64),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: Colors.grey),
            const SizedBox(height: 8),
            Text(title, textAlign: TextAlign.center),
            const SizedBox(height: 4),
            Text(message, textAlign: TextAlign.center),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 12),
              OutlinedButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

class CatalogIconBox extends StatelessWidget {
  final IconData icon;

  const CatalogIconBox({super.key, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: Colors.white),
    );
  }
}

class CatalogDetailText extends StatelessWidget {
  final String value;

  const CatalogDetailText(this.value, {super.key});

  @override
  Widget build(BuildContext context) {
    return Text(
      value,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
    );
  }
}

class CatalogSummaryRow extends StatelessWidget {
  final IconData icon;
  final String value;

  const CatalogSummaryRow({super.key, required this.icon, required this.value});

  @override
  Widget build(BuildContext context) {
    final detailColor = Theme.of(context).colorScheme.onSurface;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: detailColor),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: detailColor),
            ),
          ),
        ],
      ),
    );
  }
}
