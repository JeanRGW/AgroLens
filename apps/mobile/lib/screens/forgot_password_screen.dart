import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../widgets/custom_button.dart';
import '../widgets/custom_text_field.dart';

class ForgotPasswordScreen extends StatefulWidget {
  final AuthService authService;
  const ForgotPasswordScreen({super.key, required this.authService});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _loading = false;
  bool _submitted = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  String? _emailValidator(String? v) => v == null || v.trim().isEmpty
      ? 'Por favor, insira seu email'
      : !RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(v.trim())
      ? 'Por favor, insira um email válido'
      : null;

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false) || _loading) return;
    setState(() => _loading = true);
    try {
      await widget.authService.requestPasswordReset(email: _email.text.trim());
      if (!mounted) return;
      setState(() => _submitted = true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Se o email estiver cadastrado, enviamos um link de redefinição.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      final message = e is ApiException
          ? (e.statusCode == 503
                ? 'Recuperação por email não configurada. Contate o administrador.'
                : e.statusCode == 429
                ? 'Muitas tentativas. Tente novamente mais tarde.'
                : 'Não foi possível enviar o email. Tente novamente.')
          : 'Não foi possível enviar o email. Tente novamente.';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Recuperação de senha')),
    body: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: _submitted
          ? Column(
              children: [
                const SizedBox(height: 24),
                Icon(
                  Icons.mark_email_read_outlined,
                  size: 48,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  'Verifique seu email',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  'Se o email estiver cadastrado, enviamos um link válido por 30 minutos. Verifique também a caixa de spam.\n\nAbra o link no navegador para criar uma nova senha.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey[700]),
                ),
                const SizedBox(height: 24),
                CustomButton(
                  label: 'Voltar ao login',
                  onPressed: () => Navigator.pop(context),
                  icon: Icons.arrow_back,
                ),
              ],
            )
          : Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Informe o email da sua conta. Enviaremos um link para criar uma nova senha (abra no navegador).',
                    style: TextStyle(color: Colors.grey[700]),
                  ),
                  const SizedBox(height: 24),
                  CustomTextField(
                    label: 'Email',
                    hint: 'Digite seu email',
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: const Icon(Icons.email_outlined),
                    validator: _emailValidator,
                  ),
                  const SizedBox(height: 16),
                  CustomButton(
                    label: 'Enviar link',
                    onPressed: _submit,
                    isLoading: _loading,
                    icon: Icons.send_outlined,
                  ),
                ],
              ),
            ),
    ),
  );
}
