import 'package:uuid/uuid.dart';

String? validateCatalogUuid(String? value) =>
    Uuid.isValidUUID(fromString: value?.trim() ?? '')
    ? null
    : 'Informe um UUID válido';

String? validateRequiredText(String? value, String label) {
  if (value == null || value.trim().isEmpty) {
    return '$label é obrigatório';
  }
  return null;
}

String? validateRequiredDecimal(
  String? value,
  String label, {
  double? min,
  double? max,
}) {
  if (value == null || value.trim().isEmpty) {
    return '$label é obrigatório';
  }
  final number = double.tryParse(value.trim());
  if (number == null ||
      (min != null && number < min) ||
      (max != null && number > max)) {
    return '$label inválido';
  }
  return null;
}

bool matchesSearchQuery(String value, String query) {
  final normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.isEmpty) return true;
  return value.toLowerCase().contains(normalizedQuery);
}
