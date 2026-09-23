/// Maps backend source enum values to localized display labels.
String sourceLabel(String? raw) {
  switch (raw?.trim().toLowerCase()) {
    case 'drone':
      return 'Drone';
    case 'mixed':
      return 'Misto';
    case 'phone':
    case 'celular':
      return 'Celular';
    default:
      final t = raw?.trim() ?? '';
      return t.isEmpty ? '—' : t;
  }
}
