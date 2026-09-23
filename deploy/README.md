# AgroLens Deployment

This directory contains deployment and development orchestration configurations for AgroLens.

## Structure

```
deploy/
├── docker-compose.dev.yml       # Local development stack (Postgres, Garage S3, API, optional inference)
├── garage.toml                  # Local development Garage storage configuration
├── README.md                    # This document
└── production/                  # Production runtime environment
    ├── docker-compose.prod.yml  # Production stack (Postgres, Garage, merged API/worker, inference)
    ├── .env.example             # Documented production environment variables
    ├── Caddyfile.example        # Reverse proxy and SSL configuration template
    ├── garage.toml.template     # Production Garage storage configuration template
    ├── agrolens-backup.sh       # Automated database and storage backup script
    ├── agrolens-maintenance.sh  # Automated maintenance script
    ├── backup.env.example       # Environment configuration for backup service
    ├── systemd/                 # Systemd service and timer unit definitions
    │   ├── agrolens-backup.service
    │   ├── agrolens-backup.timer
    │   ├── agrolens-maintenance.service
    │   └── agrolens-maintenance.timer
    └── tests/                   # Backup and restoration integration tests
```

## Local Development Stack

To run local dependencies (PostgreSQL and Garage S3) or the full API container:

```bash
# Start Postgres and Garage S3 (recommended when developing API locally)
docker compose -f deploy/docker-compose.dev.yml up -d postgres garage

# Start Postgres, Garage S3, and the built API container
docker compose -f deploy/docker-compose.dev.yml up -d postgres garage api

# Start with CPU-only inference enabled
docker compose -f deploy/docker-compose.dev.yml --profile ai up -d
```

### Services & Ports

- **PostgreSQL**: `localhost:5432` (database: `agrolens`, user: `postgres`, pass: `postgres`)
- **Garage S3 API**: `localhost:3900`
- **Garage Administration**: `localhost:3903`
- **AgroLens API**: `localhost:3000/api`
- **Inference Service**: `localhost:8000` (internal network or `--profile ai`)

## Production Deployment

Production deployment is managed under `deploy/production/`:

```bash
cd deploy/production

# Validate production Compose configuration
docker compose -f docker-compose.prod.yml --env-file .env.example config --quiet

# Build and start services
docker compose -f docker-compose.prod.yml up -d
```

For full production deployment instructions, host reverse-proxy setup, and maintenance schedules, see [deploy/production/README.md](./production/README.md).
