# API Reference

Quick reference for all API endpoints.

## Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/status` | Full system status |
| POST | `/v1/chat/completions` | Chat completions (OpenAI format) |

## Metrics & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metrics` | Metrics summary |
| GET | `/metrics/prometheus` | Prometheus export |
| GET | `/pool-stats` | Connection pool stats |

## Caching

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/cache-stats` | Request cache stats |
| GET | `/semantic-cache-stats` | Semantic cache stats |
| POST | `/cache/clear` | Clear cache |

## Circuit Breaker & Reliability

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/circuits` | Circuit breaker states |
| POST | `/circuits/:name/reset` | Reset circuit |
| GET | `/failover-stats` | Auto failover stats |
| GET | `/queue-stats` | Request queue stats |
| GET | `/dedup-stats` | Deduplication stats |
| GET | `/speculative-stats` | Speculative execution stats |
| GET | `/load-balancer-stats` | Load balancer stats |
| GET | `/fallback-stats` | Smart fallback stats |
| GET | `/batcher-stats` | Request batcher stats |

## Quality & Content

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/quality-stats` | Quality scoring stats |
| GET | `/filter-stats` | Content filter stats |
| POST | `/filter/check` | Check content against filter |
| GET | `/optimizer-stats` | Prompt optimizer stats |
| POST | `/optimize-prompt` | Optimize a prompt |

## A/B Testing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ab-tests` | List experiments |
| POST | `/ab-tests` | Create experiment |
| GET | `/ab-tests/:id` | Get experiment results |

## Anomaly Detection

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/anomaly-stats` | Anomaly detection stats |

## Request Replay

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/replay-stats` | Replay stats |
| GET | `/replay/failed` | List failed requests |

## Debug Mode

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/debug-stats` | Debug mode stats |
| POST | `/debug/enable` | Enable debug mode |
| POST | `/debug/disable` | Disable debug mode |
| GET | `/debug/logs` | Query debug logs |

## Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/webhooks` | List webhooks |
| POST | `/webhooks` | Register webhook |
| DELETE | `/webhooks/:id` | Delete webhook |

## Audit Logging

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/audit-stats` | Audit log stats |
| GET | `/audit/logs` | Query audit logs |
| GET | `/audit/export` | Export logs (JSON/CSV) |

## Multi-Tenant

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants` | List tenants |
| POST | `/tenants` | Create tenant |
| GET | `/tenants/:id` | Get tenant |
| PUT | `/tenants/:id` | Update tenant |
| DELETE | `/tenants/:id` | Delete tenant |

## API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api-keys` | List API keys |
| POST | `/api-keys` | Generate key |
| GET | `/api-keys/:id` | Get key info |
| DELETE | `/api-keys/:id` | Delete key |

## Rate Limiting

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rate-limits` | Rate limiter stats |
| GET | `/rate-limits/:clientId` | Get client status |
| POST | `/rate-limits/:clientId` | Set client limits |

## IP Filter

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ip-filter` | Filter stats |
| POST | `/ip-filter/whitelist` | Add to whitelist |
| POST | `/ip-filter/blacklist` | Add to blacklist |

## Request Signing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/signing-stats` | Signing stats |

## Prompt Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/templates` | List templates |
| POST | `/templates` | Create template |
| GET | `/templates/:id` | Get template |
| POST | `/templates/:id/render` | Render template |
| DELETE | `/templates/:id` | Delete template |

## Model Orchestration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/pipelines` | List pipelines |
| POST | `/pipelines` | Create pipeline |
| GET | `/pipelines/:id` | Get pipeline |

## Conversation Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/conversations` | List conversations |
| GET | `/conversations/:id` | Get conversation |
| GET | `/conversations/:id/messages` | Get messages |
| DELETE | `/conversations/:id` | Delete conversation |

## Function Router

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/functions` | Function stats |
| GET | `/functions/schemas` | Get schemas |

## Streaming

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/streaming-stats` | Streaming optimizer stats |

## Canary Deployments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/canary` | List deployments |
| POST | `/canary` | Create deployment |
| GET | `/canary/:id` | Get deployment |
| POST | `/canary/:id/rollback` | Rollback |
| POST | `/canary/:id/promote` | Promote to 100% |

## Traffic Shadowing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/shadows` | List shadows |
| POST | `/shadows` | Create shadow |
| DELETE | `/shadows/:id` | Delete shadow |

## Geographic Routing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/geo-routing` | Routing stats |
| POST | `/geo-routing/endpoints` | Register endpoint |

## Custom Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/alerts` | List rules & stats |
| POST | `/alerts/rules` | Create rule |
| GET | `/alerts/history` | Alert history |

## SLA Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sla` | List SLAs |
| POST | `/sla` | Define SLA |
| GET | `/sla/:id` | Get SLA |

## Usage Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics` | Analytics stats |
| GET | `/analytics/summary` | Usage summary |
| GET | `/analytics/by-model` | By model |
| GET | `/analytics/by-provider` | By provider |
| GET | `/analytics/by-client` | By client |
| GET | `/analytics/cost` | Cost breakdown |
| GET | `/analytics/trends` | Usage trends |
| GET | `/analytics/report` | Full report |

## Token Estimation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/estimate-tokens` | Estimate tokens |
| POST | `/check-context` | Check context limits |

---

## Request Examples

### Create Tenant
```bash
curl -X POST http://localhost:3001/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "id": "tenant-1",
    "name": "My App",
    "rateLimit": {"requests": 1000, "window": 60000},
    "budgetLimit": 100.00
  }'
```

### Generate API Key
```bash
curl -X POST http://localhost:3001/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production",
    "tenantId": "tenant-1",
    "scopes": ["chat:read", "chat:write"]
  }'
```

### Create Alert Rule
```bash
curl -X POST http://localhost:3001/alerts/rules \
  -H "Content-Type: application/json" \
  -d '{
    "id": "high-latency",
    "metric": "latency",
    "threshold": 5000,
    "operator": "gt",
    "severity": "warning"
  }'
```

### Create Canary Deployment
```bash
curl -X POST http://localhost:3001/canary \
  -H "Content-Type: application/json" \
  -d '{
    "id": "gpt4-test",
    "baseline": {"model": "gpt-3.5-turbo"},
    "canary": {"model": "gpt-4-turbo"},
    "initialWeight": 5
  }'
```

### Create Prompt Template
```bash
curl -X POST http://localhost:3001/templates \
  -H "Content-Type: application/json" \
  -d '{
    "id": "summarize",
    "name": "Summarize Text",
    "template": "Summarize in {{length}} sentences:\n\n{{text}}",
    "defaults": {"length": "3"}
  }'
```

### Render Template
```bash
curl -X POST http://localhost:3001/templates/summarize/render \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Long article content here...",
    "length": "5"
  }'
```
