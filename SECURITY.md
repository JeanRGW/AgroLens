# Security Policy

## Reporting Security Issues

Please report security issues privately to the repository owner. Do not open public issues containing credentials, exploit details, private URLs, or sensitive data.

## Secret Handling

- Never commit `.env` files, Android signing keys, keystores, local database dumps, or Playwright auth state.
- Use `.env.example` files for documented configuration only.
- Store production credentials in a secret manager or on the deployment host with restricted permissions.
- Rotate credentials immediately if they are exposed.

## Production Notes

- Swagger documentation should be disabled or protected in production.
- CORS origins must be explicit in production.
- Backups should be encrypted and restore-tested regularly.
