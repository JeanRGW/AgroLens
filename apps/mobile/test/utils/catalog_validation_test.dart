import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/utils/catalog_validation.dart';

void main() {
  test('validateRequiredText rejects empty values', () {
    expect(validateRequiredText(null, 'Nome'), 'Nome é obrigatório');
    expect(validateRequiredText('   ', 'Nome'), 'Nome é obrigatório');
    expect(validateRequiredText('Teste', 'Nome'), isNull);
  });

  test('validateRequiredDecimal rejects missing and invalid values', () {
    expect(validateRequiredDecimal(null, 'Latitude'), 'Latitude é obrigatório');
    expect(validateRequiredDecimal('abc', 'Latitude'), 'Latitude inválido');
    expect(validateRequiredDecimal(' -22.9 ', 'Latitude'), isNull);
    expect(
      validateRequiredDecimal('-90', 'Latitude', min: -90, max: 90),
      isNull,
    );
    expect(
      validateRequiredDecimal('90', 'Latitude', min: -90, max: 90),
      isNull,
    );
    expect(
      validateRequiredDecimal('-90.1', 'Latitude', min: -90, max: 90),
      'Latitude inválido',
    );
    expect(
      validateRequiredDecimal('90.1', 'Latitude', min: -90, max: 90),
      'Latitude inválido',
    );
    expect(
      validateRequiredDecimal('-180', 'Longitude', min: -180, max: 180),
      isNull,
    );
    expect(
      validateRequiredDecimal('180', 'Longitude', min: -180, max: 180),
      isNull,
    );
    expect(
      validateRequiredDecimal('-180.1', 'Longitude', min: -180, max: 180),
      'Longitude inválido',
    );
    expect(
      validateRequiredDecimal('180.1', 'Longitude', min: -180, max: 180),
      'Longitude inválido',
    );
  });

  test('matchesSearchQuery performs case-insensitive contains matching', () {
    expect(matchesSearchQuery('Fazenda Boa Vista', 'boa'), isTrue);
    expect(matchesSearchQuery('Fazenda Boa Vista', 'SÍTIO'), isFalse);
    expect(matchesSearchQuery('Fazenda Boa Vista', ' '), isTrue);
  });
}
