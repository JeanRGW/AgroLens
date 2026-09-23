import 'package:flutter/material.dart';

class AppTheme {
  static final ColorScheme _lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: Colors.lightGreen[700]!,
    onPrimary: Colors.white,
    secondary: Colors.lightGreen[500]!,
    onSecondary: Colors.white,
    error: Colors.red,
    onError: Colors.white,
    surface: Colors.white,
    onSurface: Colors.black,
  );

  static ThemeData lightTheme() => ThemeData(
    colorScheme: _lightScheme,
    scaffoldBackgroundColor: Colors.white,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.lightGreen,
      foregroundColor: Colors.black,
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: Colors.green,
      foregroundColor: Colors.white,
    ),
  );

  static ThemeData darkTheme() => lightTheme();
}
