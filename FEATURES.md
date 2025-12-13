# AIClient-2-API Features

A comprehensive AI API gateway with 43+ middleware modules for performance, quality, security, and observability.

---

## Table of Contents

1. [Performance & Transport](#performance--transport)
2. [Caching & Optimization](#caching--optimization)
3. [Reliability & Resilience](#reliability--resilience)
4. [Quality & Intelligence](#quality--intelligence)
5. [Security & Access Control](#security--access-control)
6. [Advanced AI Features](#advanced-ai-features)
7. [Advanced Routing](#advanced-routing)
8. [Analytics & Monitoring](#analytics--monitoring)
9. [Developer Experience](#developer-experience)
10. [API Endpoints Reference](#api-endpoints-reference)

---

## Performance & Transport

### Unified Transport (`src/transport/unified-transport.js`)
High-performance HTTP client with connection pooling and optimization.

| Feature | Description |
|---------|-------------|
| DNS Caching | 5-minute TTL for DNS lookups |
| Connection Pools | 128 connections per origin |
| Keep-Alive | 120s connection reuse |
| HTTP/2 Support | Automatic protocol negotiation |
| Retry Logic | Exponential backoff with jitter |
| SSE Streaming | Server-sent events support |

### Advanced Metrics (`src/metrics/advanced-metrics.js`)
Comprehensive metrics collection and export.

| Feature | Description |
|---------|-------------|
| Latency Histograms | P50, P95, P99 percentiles |
| Cost Tracking | Per-model and per-provider costs |
| Prometheus Export | `/metrics/prometheus` endpoint |
| Token Counting | Input/output token tracking |

---

## Caching & Optimization

### Request Cache (`src/middleware/request-cache.js`)
LRU cache with TTL for identical requests.

```javascript
// Configuration
{
  maxSize: 1000,
  ttl: 300000  // 5 minutes
}
```

### Semantic Cache (`src/middleware/semantic-cache.js`)
Similarity-based caching using prompt embeddings.

| Feature | Description |
|---------|-------------|
| Similarity Threshold | 85% match for cache hits |
| TF-IDF Scoring | Intelligent prompt matching |
| Model-Aware | Separate caches per model |

### Request Deduplication (`src/middleware/request-dedup.js`)
Prevents duplicate concurrent requests.

### Request Batching (`src/middleware/request-batching.js`)
Combines small requests for efficiency.

### Prompt Optimizer (`src/middleware/prompt-optimizer.js`)
Reduces token usage while maintaining quality.

| Level | Description |
|-------|-------------|
| Light | Remove verbose phrases |
| Medium | Compress whitespace, code comments |
| Aggressive | Remove filler words, redundant context |

### Token Estimator (`src/middleware/token-estimator.js`)
Pre-flight token counting and overflow prevention.

---

## Reliability & Resilience

### Circuit Breaker (`src/middleware/circuit-breaker.js`)
Prevents cascade failures with automatic recovery.

| State | Description |
|-------|-------------|
| CLOSED | Normal operation |
| OPEN | Requests blocked after failures |
| HALF_OPEN | Testing recovery |

### Auto Failover (`src/middleware/auto-failover.js`)
Automatic provider switching on failures.

### Smart Fallback (`src/middleware/smart-fallback.js`)
Model fallback chains with cost/speed optimization.

```javascript
// Example chain
['gpt-4-turbo', 'gpt-3.5-turbo', 'claude-instant']
```

### Speculative Execution (`src/middleware/speculative-execution.js`)
Parallel requests with hedging for latency reduction.

### Adaptive Load Balancer (`src/middleware/adaptive-load-balancer.js`)
Latency-aware request routing.

| Strategy | Description |
|----------|-------------|
| Round Robin | Equal distribution |
| Least Latency | Route to fastest |
| Weighted | Custom weights |
| Random | Random selection |

### Request Queue (`src/middleware/request-queue.js`)
Priority queue with rate limiting.

### Graceful Shutdown (`src/middleware/graceful-shutdown.js`)
Connection draining and cleanup.

---

## Quality & Intelligence

### Quality Scoring (`src/middleware/quality-scoring.js`)
Automatic response quality assessment.

| Factor | Weight |
|--------|--------|
| Completeness | 25% |
| Coherence | 20% |
| Relevance | 25% |
| Formatting | 15% |
| Latency | 10% |
| Token Efficiency | 5% |

### Content Filter (`src/middleware/content-filter.js`)
Block inappropriate content.

| Category | Description |
|----------|-------------|
| Violence | Violent content detection |
| Hate Speech | Discriminatory language |
| Illegal | Illegal activities |
| PII | Personal information |
| Jailbreak | Prompt injection attempts |

### A/B Testing (`src/middleware/ab-testing.js`)
Test models and configurations.

| Feature | Description |
|---------|-------------|
| Traffic Splitting | Percentage-based routing |
| Statistical Significance | Auto-detection |
| Metrics Tracking | Latency, quality, errors |

### Anomaly Detection (`src/middleware/anomaly-detection.js`)
Detect unusual patterns using z-scores.

| Metric | Description |
|--------|-------------|
| Latency | Response time anomalies |
| Error Rate | Unusual error spikes |
| Cost | Spending anomalies |
| Token Usage | Unusual consumption |

---

## Security & Access Control

### Multi-Tenant Support (`src/middleware/multi-tenant.js`)
Isolate clients with separate configurations.

```javascript
// Create tenant
POST /tenants
{
  "id": "tenant-1",
  "name": "Client A",
  "rateLimit": { "requests": 1000, "window": 60000 },
  "budgetLimit": 100.00,
  "allowedModels": ["gpt-4", "gpt-3.5-turbo"]
}
```

### API Key Management (`src/middleware/api-key-manager.js`)
Create, rotate, and revoke API keys.

| Feature | Description |
|---------|-------------|
| Key Generation | Secure random keys |
| Rotation | Replace keys safely |
| Scopes | Fine-grained permissions |
| Expiration | Auto-expire keys |

### Per-Client Rate Limiting (`src/middleware/client-rate-limiter.js`)
Fine-grained rate limits by client.

```javascript
// Set limits
POST /rate-limits/client-123
{
  "requests": 100,
  "window": 60000,
  "tokens": 100000
}
```

### IP Filter (`src/middleware/ip-filter.js`)
Whitelist/blacklist with CIDR support.

| Mode | Description |
|------|-------------|
| Whitelist | Only allow listed IPs |
| Blacklist | Block listed IPs |

### Request Signing (`src/middleware/request-signing.js`)
HMAC verification for request integrity.

---

## Advanced AI Features

### Prompt Templates (`src/middleware/prompt-templates.js`)
Reusable prompt library with variables.

```javascript
// Create template
POST /templates
{
  "id": "summarize",
  "template": "Summarize in {{length}} sentences:\n\n{{text}}",
  "defaults": { "length": "3" }
}

// Render template
POST /templates/summarize/render
{
  "text": "Long article...",
  "length": "5"
}
```

### Multi-Model Orchestration (`src/middleware/model-orchestration.js`)
Chain multiple models for complex workflows.

```javascript
// Create pipeline
POST /pipelines
{
  "id": "analyze-and-summarize",
  "steps": [
    { "model": "gpt-4", "prompt": "Analyze: {{input}}" },
    { "model": "gpt-3.5-turbo", "prompt": "Summarize: {{outputs.step_0_output}}" }
  ]
}
```

### Conversation Memory (`src/middleware/conversation-memory.js`)
Persist chat history across sessions.

| Feature | Description |
|---------|-------------|
| Auto-Compaction | Summarize old messages |
| Token Limits | Stay within context window |
| TTL | Auto-expire conversations |

### Function Router (`src/middleware/function-router.js`)
Route tool/function calls to handlers.

```javascript
// Register function
functionRouter.register({
  name: 'get_weather',
  description: 'Get weather for location',
  parameters: { location: { type: 'string' } },
  handler: async ({ location }) => fetchWeather(location)
});
```

### Streaming Optimizer (`src/middleware/streaming-optimizer.js`)
Optimize streaming responses.

| Feature | Description |
|---------|-------------|
| Buffering | Aggregate small chunks |
| Backpressure | Handle slow consumers |
| TTFB Tracking | Time to first byte |

---

## Advanced Routing

### Canary Deployments (`src/middleware/canary-deployment.js`)
Gradually roll out new providers/models.

```javascript
// Create canary
POST /canary
{
  "id": "gpt4-canary",
  "baseline": { "model": "gpt-3.5-turbo" },
  "canary": { "model": "gpt-4-turbo" },
  "initialWeight": 5,
  "incrementStep": 5
}
```

### Traffic Shadowing (`src/middleware/traffic-shadow.js`)
Mirror traffic for testing without affecting production.

```javascript
// Create shadow
POST /shadows
{
  "id": "test-shadow",
  "targetUrl": "https://test-api.example.com",
  "sampleRate": 10  // 10% of traffic
}
```

### Geographic Routing (`src/middleware/geographic-routing.js`)
Route to nearest/optimal endpoints.

| Region | Location |
|--------|----------|
| us-east | Virginia |
| us-west | San Francisco |
| eu-west | Dublin |
| eu-central | Frankfurt |
| asia-east | Tokyo |
| asia-southeast | Singapore |

---

## Analytics & Monitoring

### Custom Alerts (`src/middleware/custom-alerts.js`)
Configurable alert rules.

```javascript
// Create alert rule
POST /alerts/rules
{
  "id": "high-latency",
  "metric": "latency",
  "threshold": 5000,
  "operator": "gt",
  "severity": "warning",
  "window": 60000
}
```

### SLA Monitoring (`src/middleware/sla-monitor.js`)
Track uptime and latency against targets.

```javascript
// Define SLA
POST /sla
{
  "id": "production-sla",
  "targets": {
    "uptime": 99.9,
    "latencyP95": 2000,
    "errorRate": 0.1
  }
}
```

### Usage Analytics (`src/middleware/usage-analytics.js`)
Detailed usage reports and insights.

| Report | Endpoint |
|--------|----------|
| Summary | `/analytics/summary` |
| By Model | `/analytics/by-model` |
| By Provider | `/analytics/by-provider` |
| By Client | `/analytics/by-client` |
| Cost Breakdown | `/analytics/cost` |
| Trends | `/analytics/trends` |
| Full Report | `/analytics/report` |

---

## Developer Experience

### Debug Mode (`src/middleware/debug-mode.js`)
Enhanced logging and diagnostics.

| Level | Description |
|-------|-------------|
| 1 | Basic logging |
| 2 | Timing and events |
| 3 | Full request/response |

### Request Replay (`src/middleware/request-replay.js`)
Store and replay failed requests.

### Request Tracing (`src/middleware/request-tracing.js`)
Distributed tracing with trace IDs.

### Webhook Notifications (`src/middleware/webhooks.js`)
Async notifications with HMAC signing.

| Event | Description |
|-------|-------------|
| request.completed | Request finished |
| request.failed | Request error |
| circuit.opened | Circuit breaker opened |
| anomaly.detected | Anomaly found |

### Audit Logging (`src/middleware/audit-log.js`)
Compliance logging with export.

---

## API Endpoints Reference

### Health & Status
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/status` | Full system status |
| GET | `/metrics` | Metrics summary |
| GET | `/metrics/prometheus` | Prometheus format |

### Caching
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/cache-stats` | Cache statistics |
| GET | `/semantic-cache-stats` | Semantic cache stats |
| POST | `/cache/clear` | Clear cache |

### Circuit Breaker
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/circuits` | All circuit states |
| POST | `/circuits/:name/reset` | Reset circuit |

### Quality
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/quality-stats` | Quality scores |
| GET | `/filter-stats` | Content filter stats |
| POST | `/filter/check` | Check content |
| POST | `/optimize-prompt` | Optimize prompt |

### A/B Testing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ab-tests` | List experiments |
| POST | `/ab-tests` | Create experiment |
| GET | `/ab-tests/:id` | Get results |

### Security
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants` | List tenants |
| POST | `/tenants` | Create tenant |
| GET | `/api-keys` | List API keys |
| POST | `/api-keys` | Generate key |
| GET | `/rate-limits/:id` | Get rate limit status |
| GET | `/ip-filter` | Filter status |

### AI Features
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/templates` | List templates |
| POST | `/templates` | Create template |
| POST | `/templates/:id/render` | Render template |
| GET | `/pipelines` | List pipelines |
| POST | `/pipelines` | Create pipeline |
| GET | `/conversations/:id` | Get conversation |

### Routing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/canary` | Canary deployments |
| POST | `/canary` | Create canary |
| GET | `/shadows` | Traffic shadows |
| GET | `/geo-routing` | Geographic routing |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/alerts` | Alert rules |
| GET | `/alerts/history` | Alert history |
| GET | `/sla` | SLA definitions |
| GET | `/analytics/summary` | Usage summary |
| GET | `/analytics/report` | Full report |

### Debug
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/debug-stats` | Debug mode stats |
| POST | `/debug/enable` | Enable debug |
| GET | `/debug/logs` | Query logs |
| GET | `/audit/logs` | Audit logs |
| GET | `/audit/export` | Export logs |

---

## Quick Start

```bash
# Start the server
npm run start

# Check health
curl http://localhost:3001/health

# View full status
curl http://localhost:3001/status

# Create a tenant
curl -X POST http://localhost:3001/tenants \
  -H "Content-Type: application/json" \
  -d '{"id": "my-tenant", "name": "My App"}'

# Generate API key
curl -X POST http://localhost:3001/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "Production Key", "tenantId": "my-tenant"}'

# Make a chat request
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Hello!"}]}'
```

---

## Module Count Summary

| Category | Count |
|----------|-------|
| Performance & Transport | 2 |
| Caching & Optimization | 6 |
| Reliability & Resilience | 7 |
| Quality & Intelligence | 4 |
| Security & Access Control | 5 |
| Advanced AI Features | 5 |
| Advanced Routing | 3 |
| Analytics & Monitoring | 3 |
| Developer Experience | 5 |
| **Total** | **43** |

---

*Generated for AIClient-2-API*
