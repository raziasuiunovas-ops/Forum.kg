# Health Check API - Quick Reference

## Endpoints

| URL | Query Param | Purpose | DB Check | Status Codes |
|-----|-------------|---------|----------|--------------|
| `/api/v1/health` | (none) | Readiness | ✅ Yes | 200, 503 |
| `/api/v1/health` | `?check=live` | Liveness | ❌ No | 200 |
| `/api/v1/health` | `?check=ready` | Readiness | ✅ Yes | 200, 503 |

## Quick Test

```bash
# Test liveness (always works)
curl http://localhost:3000/api/v1/health?check=live

# Test readiness (requires database)
curl http://localhost:3000/api/v1/health?check=ready
```

## Kubernetes Configuration

### Liveness Probe
```yaml
livenessProbe:
  httpGet:
    path: /api/v1/health?check=live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
  timeoutSeconds: 5
  failureThreshold: 3
```

### Readiness Probe
```yaml
readinessProbe:
  httpGet:
    path: /api/v1/health?check=ready
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 2
```

## Response Examples

### Healthy (200 OK)
```json
{
  "status": "ok",
  "timestamp": "2026-11-19T18:43:00.000Z",
  "checks": {
    "application": {"status": "ok"},
    "database": {"status": "ok"}
  }
}
```

### Database Down (503)
```json
{
  "status": "unavailable",
  "timestamp": "2026-11-19T18:43:00.000Z",
  "checks": {
    "application": {"status": "ok"},
    "database": {"status": "unavailable"}
  }
}
```

## Security

✅ Does NOT expose:
- Database connection strings
- Environment variables
- Stack traces
- Internal error details
- File paths or credentials

## Full Documentation

See [HEALTH_CHECK_IMPLEMENTATION.md](../../../../HEALTH_CHECK_IMPLEMENTATION.md) for complete implementation details.
