import 'package:flutter/material.dart';
import 'package:mask_text_input_formatter/mask_text_input_formatter.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../widgets/custom_button.dart';
import '../widgets/custom_text_field.dart';

class RegisterScreen extends StatefulWidget {
  final AuthService authService;
  final VoidCallback? onLoginTap;

  const RegisterScreen({super.key, required this.authService, this.onLoginTap});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _mask = MaskTextInputFormatter(
    mask: '(##) #####-####',
    filter: {'#': RegExp(r'[0-9]')},
  );
  bool _loading = false;

  @override
  void dispose() {
    for (final controller in [_name, _email, _phone, _password, _confirm]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _emailValidator(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Por favor, insira seu email.';
    }
    return RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(value.trim())
        ? null
        : 'Por favor, insira um email válido.';
  }

  Future<void> _register() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _loading = true);
    try {
      await widget.authService.register(
        email: _email.text.trim().toLowerCase(),
        password: _password.text,
        fullName: _name.text.trim(),
        phone: _mask.getUnmaskedText(),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cadastro realizado com sucesso!')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error is ApiException ? error.message : error.toString(),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 48,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Junte-se a nós hoje',
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                      ),
                      const SizedBox(height: 8),
                      const Text('Crie uma nova conta para começar'),
                      const SizedBox(height: 32),
                      Form(
                        key: _formKey,
                        child: Column(
                          children: [
                            CustomTextField(
                              label: 'Nome completo',
                              hint: 'Digite seu nome completo',
                              controller: _name,
                              prefixIcon: const Icon(Icons.person_outlined),
                              validator: (value) =>
                                  value == null || value.trim().length < 3
                                  ? 'O nome deve ter pelo menos 3 caracteres'
                                  : null,
                            ),
                            CustomTextField(
                              label: 'Email',
                              hint: 'Insira seu email',
                              controller: _email,
                              keyboardType: TextInputType.emailAddress,
                              prefixIcon: const Icon(Icons.email_outlined),
                              validator: _emailValidator,
                            ),
                            CustomTextField(
                              label: 'Número de telefone',
                              hint: 'Insira seu número de telefone',
                              controller: _phone,
                              keyboardType: TextInputType.phone,
                              inputFormatters: [_mask],
                              prefixIcon: const Icon(Icons.phone_outlined),
                              validator: (value) =>
                                  _mask.getUnmaskedText().length != 11
                                  ? 'O telefone deve ter 11 dígitos'
                                  : null,
                            ),
                            CustomTextField(
                              label: 'Senha',
                              hint: 'Crie uma senha forte',
                              controller: _password,
                              obscureText: true,
                              prefixIcon: const Icon(Icons.lock_outlined),
                              validator: (value) =>
                                  value == null || value.length < 8
                                  ? 'A senha deve ter pelo menos 8 caracteres'
                                  : !RegExp(r'[A-Z]').hasMatch(value)
                                  ? 'A senha deve conter letras maiúsculas'
                                  : !RegExp(r'[0-9]').hasMatch(value)
                                  ? 'A senha deve conter números'
                                  : null,
                            ),
                            CustomTextField(
                              label: 'Confirmar senha',
                              hint: 'Confirme sua senha',
                              controller: _confirm,
                              obscureText: true,
                              prefixIcon: const Icon(Icons.lock_outlined),
                              validator: (value) => value != _password.text
                                  ? 'As senhas não coincidem'
                                  : null,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      CustomButton(
                        label: 'Criar conta',
                        onPressed: _register,
                        isLoading: _loading,
                        icon: Icons.person_add,
                      ),
                      const SizedBox(height: 16),
                      Center(
                        child: TextButton(
                          onPressed: widget.onLoginTap,
                          child: const Text('Já tem uma conta? Entrar'),
                        ),
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
}
