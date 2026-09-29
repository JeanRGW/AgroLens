import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../widgets/custom_button.dart';
import '../widgets/custom_text_field.dart';
import '../widgets/partner_logos.dart';
import 'forgot_password_screen.dart';

class LoginScreen extends StatefulWidget {
  final AuthService authService;
  final VoidCallback? onRegisterTap;
  const LoginScreen({super.key, required this.authService, this.onRegisterTap});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController(), _password = TextEditingController();
  bool _loading = false;
  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  String? _emailValidator(String? v) => v == null || v.trim().isEmpty
      ? 'Por favor, insira seu email.'
      : !RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(v.trim())
      ? 'Por favor, insira um email válido.'
      : null;
  Future<void> _forgot() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ForgotPasswordScreen(authService: widget.authService),
      ),
    );
  }

  Future<void> _login() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _loading = true);
    try {
      await widget.authService.login(
        email: _email.text.trim().toLowerCase(),
        password: _password.text,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Login realizado com sucesso!')),
        );
      }
    } on TimeoutException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Tempo limite ao conectar. Verifique sua conexão e tente novamente.',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        // The backend only reports suspension after a correct password, so
        // naming the state here does not help enumerate accounts.
        final message = e is ApiException && e.isAccountDisabled
            ? 'Conta suspensa. Fale com um administrador.'
            : e is ApiException
            ? e.message
            : e.toString();
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Theme.of(context).colorScheme.primary.withValues(alpha: .1),
                  Theme.of(
                    context,
                  ).colorScheme.secondary.withValues(alpha: .25),
                ],
              ),
            ),
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(height: 64),
                    Image.asset(
                      'assets/logo/main_logo.png',
                      width: 220,
                      fit: BoxFit.contain,
                    ),
                    Text(
                      'Bem-vindo de volta!',
                      style: Theme.of(context).textTheme.headlineLarge
                          ?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: Theme.of(context).colorScheme.primary,
                            shadows: [
                              Shadow(
                                color: Colors.grey.withValues(alpha: .5),
                                offset: const Offset(2, 2),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Faça login para continuar',
                      style: Theme.of(
                        context,
                      ).textTheme.bodyMedium?.copyWith(color: Colors.grey[800]),
                    ),
                    const SizedBox(height: 40),
                    Form(
                      key: _formKey,
                      child: Column(
                        children: [
                          CustomTextField(
                            label: 'Email',
                            hint: 'Digite seu email',
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            prefixIcon: const Icon(Icons.email_outlined),
                            validator: _emailValidator,
                          ),
                          CustomTextField(
                            label: 'Senha',
                            hint: 'Digite sua senha',
                            controller: _password,
                            obscureText: true,
                            prefixIcon: const Icon(Icons.lock_outlined),
                            validator: (v) => v == null || v.isEmpty
                                ? 'Por favor, insira sua senha'
                                : v.length < 6
                                ? 'A senha deve ter pelo menos 6 caracteres'
                                : null,
                          ),
                        ],
                      ),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _forgot,
                        child: const Text('Esqueceu a senha?'),
                      ),
                    ),
                    const SizedBox(height: 24),
                    CustomButton(
                      label: 'Entrar',
                      onPressed: _login,
                      isLoading: _loading,
                      icon: Icons.login,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(child: Divider(color: Colors.grey[400])),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: Text(
                            'OU',
                            style: TextStyle(
                              color: Colors.grey[600],
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Expanded(child: Divider(color: Colors.grey[400])),
                      ],
                    ),
                    const SizedBox(height: 16),
                    CustomButton(
                      label: 'Criar conta',
                      onPressed: widget.onRegisterTap,
                      isOutlined: true,
                      icon: Icons.person_add_outlined,
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Apoio e parceria',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: Colors.grey[700],
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 32,
                      runSpacing: 8,
                      children: kPartnerLogos
                          .map(
                            (name) => SizedBox(
                              width: 84,
                              height: 34,
                              child: buildPartnerLogo(name),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
