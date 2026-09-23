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
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _email;
  final _mask = MaskTextInputFormatter(
    mask: '(##) #####-####',
    filter: {'#': RegExp(r'[0-9]')},
  );
  bool _saving = false;

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
    super.dispose();
  }

  Future<void> _save() async {
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

  @override
  Widget build(BuildContext context) {
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: 'Editar Perfil',
        subtitle: 'Atualize seus dados cadastrais',
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
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
                    label: 'Nome Completo',
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
                ],
              ),
            ),
            const SizedBox(height: 24),
            CustomButton(
              label: 'Salvar Alterações',
              onPressed: _save,
              isLoading: _saving,
              icon: Icons.save_outlined,
            ),
          ],
        ),
      ),
    );
  }
}
