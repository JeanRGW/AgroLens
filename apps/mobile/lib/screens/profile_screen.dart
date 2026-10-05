import 'package:flutter/material.dart';
import 'package:mask_text_input_formatter/mask_text_input_formatter.dart';
import '../services/auth_service.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/custom_button.dart';
import '../widgets/custom_scaffold.dart';
import '../widgets/custom_text_field.dart';

class ProfileScreen extends StatefulWidget {
  final AuthService authService;

  const ProfileScreen({super.key, required this.authService});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _passwordFormKey = GlobalKey<FormState>();
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmPassword = TextEditingController();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _email;
  final _mask = MaskTextInputFormatter(
    mask: '(##) #####-####',
    filter: {'#': RegExp(r'[0-9]')},
  );
  bool _saving = false;
  bool _changingPassword = false;
  String? _passwordError;

  @override
  void initState() {
    super.initState();
    final user = widget.authService.currentUser;
    _name = TextEditingController(text: user?.fullName ?? '');
    _email = TextEditingController(text: user?.email ?? '');
    final digits = (user?.phone ?? '').replaceAll(RegExp(r'\D'), '');
    _phone = TextEditingController(text: _mask.maskText(digits));
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _currentPassword.dispose();
    _newPassword.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || _changingPassword) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await widget.authService.updateProfile(
        fullName: _name.text.trim(),
        phone: _mask.getUnmaskedText(),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Não foi possível atualizar o perfil. Tente novamente.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _changePassword() async {
    if (_saving || _changingPassword) return;
    if (!(_passwordFormKey.currentState?.validate() ?? false)) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _changingPassword = true;
      _passwordError = null;
    });
    try {
      await widget.authService.changePassword(
        currentPassword: _currentPassword.text,
        newPassword: _newPassword.text,
      );
      if (mounted) {
        _currentPassword.clear();
        _newPassword.clear();
        _confirmPassword.clear();
      }
      if (messenger.mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('Senha alterada. Entre novamente com a nova senha.'),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _passwordError =
              'Não foi possível alterar a senha. Verifique a senha atual e tente novamente.';
        });
      }
    } finally {
      if (mounted) setState(() => _changingPassword = false);
    }
  }

  Widget _passwordSection() => Form(
    key: _passwordFormKey,
    child: Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Alterar senha',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          Text(
            'Use de 8 a 128 caracteres. Após a alteração, entre novamente com a nova senha.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 20),
          CustomTextField(
            label: 'Senha atual',
            controller: _currentPassword,
            keyboardType: TextInputType.visiblePassword,
            obscureText: true,
            readOnly: _changingPassword,
            prefixIcon: const Icon(Icons.lock_outline),
            validator: (value) =>
                value == null || value.isEmpty ? 'Informe a senha atual' : null,
          ),
          CustomTextField(
            label: 'Nova senha',
            controller: _newPassword,
            keyboardType: TextInputType.visiblePassword,
            obscureText: true,
            readOnly: _changingPassword,
            prefixIcon: const Icon(Icons.lock_outline),
            validator: (value) => value == null || value.length < 8
                ? 'A senha deve ter pelo menos 8 caracteres'
                : value.length > 128
                ? 'A senha deve ter no máximo 128 caracteres'
                : null,
          ),
          CustomTextField(
            label: 'Confirmar nova senha',
            controller: _confirmPassword,
            keyboardType: TextInputType.visiblePassword,
            obscureText: true,
            readOnly: _changingPassword,
            prefixIcon: const Icon(Icons.lock_outline),
            validator: (value) => value == null || value.isEmpty
                ? 'Confirme a nova senha'
                : value != _newPassword.text
                ? 'As senhas não coincidem'
                : null,
          ),
          if (_passwordError != null) ...[
            Text(
              _passwordError!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            const SizedBox(height: 16),
          ],
          CustomButton(
            label: 'Alterar senha',
            onPressed: _saving ? null : _changePassword,
            isLoading: _changingPassword,
            icon: Icons.lock_reset,
          ),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: 'Editar perfil',
        subtitle: 'Atualize seus dados e sua senha',
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Form(
            key: _formKey,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: Theme.of(
                    context,
                  ).colorScheme.outline.withValues(alpha: 0.35),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Informações pessoais',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Atualize seus dados para manter seu cadastro completo.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 20),
                  CustomTextField(
                    label: 'Nome completo',
                    controller: _name,
                    prefixIcon: const Icon(Icons.person_outlined),
                    validator: (value) =>
                        value == null || value.trim().length < 3
                        ? 'O nome deve ter pelo menos 3 caracteres'
                        : null,
                  ),
                  CustomTextField(
                    label: 'Telefone',
                    controller: _phone,
                    prefixIcon: const Icon(Icons.phone_outlined),
                    keyboardType: TextInputType.phone,
                    inputFormatters: [_mask],
                    validator: (value) =>
                        _mask.getUnmaskedText().isNotEmpty &&
                            _mask.getUnmaskedText().length != 11
                        ? 'O telefone deve ter 11 dígitos'
                        : null,
                  ),
                  CustomTextField(
                    label: 'Email (somente leitura)',
                    controller: _email,
                    readOnly: true,
                    prefixIcon: const Icon(Icons.email_outlined),
                    suffixIcon: const Icon(Icons.lock_outline),
                  ),
                  CustomButton(
                    label: 'Salvar alterações',
                    onPressed: _changingPassword ? null : _save,
                    isLoading: _saving,
                    icon: Icons.save_outlined,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          _passwordSection(),
        ],
      ),
    );
  }
}
