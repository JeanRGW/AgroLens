import 'package:flutter/material.dart';

/// Display info for a backend upload status, shared by the remote uploads
/// list tiles and the remote upload detail screen.
({String label, IconData icon, Color color}) remoteUploadStatusInfo(
  String status,
) => switch (status) {
  'ready' => (label: 'Pronto', icon: Icons.check_circle, color: Colors.green),
  'finalizing' => (
    label: 'Finalizando',
    icon: Icons.autorenew,
    color: Colors.blue,
  ),
  'draft' => (label: 'Rascunho', icon: Icons.edit, color: Colors.grey),
  'failed' => (label: 'Falhou', icon: Icons.error, color: Colors.red),
  _ => (label: 'Desconhecido', icon: Icons.help_outline, color: Colors.grey),
};
