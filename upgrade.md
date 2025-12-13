# AIClient-2-API Upgrade Plan: "Top-Tier" LLM Proxy

## Executive Summary
This document outlines the strategic roadmap to transform the current `AIClient-2-API` from a basic Node.js proxy into a **high-performance, enterprise-grade LLM Gateway**. The goal is to rival commercial solutions like **Portkey**, **LiteLLM**, and **Kong AI Gateway** in terms of speed, reliability, and observability.

## 1. High-Performance Tech Stack (The "Ferrari" Stack)

To achieve maximum throughput and minimum latency, we will migrate from the standard `http` + `axios` implementation to a modern, optimized Node.js stack.

| Component | Current | **Proposed Upgrade** | Why? |
| :--- | :--- | :--- | :--- |
| **Server Framework** | Native `http` | **Fastify** | 2-4x faster than Express/native routing. Low overhead. Native schema validation. |
| **Networking** | `axios` / `google-auth` | **Undici** (via `fetch`) | 2-3x faster HTTP throughput. Native connection pooling. Reduced memory footprint. |
| **Validation** | Ad-hoc / Manual | **Zod** + **Fastify Type Provider** | Zero-cost abstraction. Strict, type-safe validation for incoming OpenAI/Gemini payloads. |
| **Logging** | `console.log` | **Pino** | Asynchronous, zero-blocking structured logging. Essential for high-concurrency. |
| **State/Cache** | `provider_pools.json` | **Redis** (DragonflyDB compatible) | Sub-millisecond state access. Distributed locking. Scalable rate limiting. |
| **Caching Strategy** | None | **Semantic Caching** | Vector-based caching (using RedisVL or Qdrant) to cache "meaning" rather than just text. |

## 2. Architecture: "The Smart Gateway"

The new architecture decouples the **Request Handling** from the **Intelligence Layer**.

```mermaid
graph LR
    Client[Client App] --> |HTTP/2| Gateway[Fastify Gateway]
    
    subgraph "Fastify Gateway"
        Auth[Auth Middleware]
        RateLimit[Redis Rate Limiter]
        Cache[Semantic Cache Check]
        Router[Smart Router]
    end
    
    subgraph "Intelligence Layer"
        Balancer[Load Balancer]
        Fallback[Fallback Logic]
        PII[PII Redaction]
    end
    
    subgraph "Upstream Providers"
        OpenAI
        Gemini
        Claude
    end

    Gateway --> Auth --> RateLimit --> Cache
    Cache -- Hit --> Client
    Cache -- Miss --> Router
    Router --> PII --> Balancer --> Upstream Providers
```

## 3. Feature Roadmap

### Phase 1: The Performance Foundation (Immediate Priority)
*Objective: Maximize raw speed and stability.*
- [ ] **Migrate to Fastify:** Rewrite `api-server.js` using Fastify.
- [ ] **Implement Zod Schemas:** Define strict schemas for `/v1/chat/completions`, `/v1/models`.
- [ ] **Switch to Undici:** Replace all `axios` calls with `undici` (native fetch).
- [ ] **Async Logging:** Replace `console.log` with `pino`.
- [ ] **Unified Error Handling:** Centralized error schema (RFC 7807 problem details).

### Phase 2: Reliability & Scale
*Objective: Zero downtime and robust failure handling.*
- [ ] **Redis Integration:** Move `provider_pools.json` state to Redis.
- [ ] **Advanced Load Balancing:** Implement "Least Busy" and "Latency-Based" routing (currently Round-Robin).
- [ ] **Circuit Breakers:** Automatically disable providers that return 5xx errors for a cooldown period.
- [ ] **Smart Fallbacks:** If `gpt-4` fails, retry with `gpt-4-turbo` or `claude-3-opus` transparently.

### Phase 3: Intelligence & Efficiency
*Objective: Reduce costs and improve UX.*
- [ ] **Semantic Caching:**
    - Calculate vector embedding of incoming prompt.
    - Check Redis Vector DB for similar (>95%) past prompts.
    - Return cached response instantly (saving time & money).
- [ ] **PII Redaction:** Use lightweight regex/NLP to mask emails/phones before sending to upstream.
- [ ] **Token Budgeting:** Track token usage per API Key and enforce monthly limits.

### Phase 4: Enterprise Features
*Objective: Governance and Security.*
- [ ] **RBAC:** Role-based access control for the UI.
- [ ] **Audit Logs:** Record every administrative action (changing config, adding keys).
- [ ] **Virtual Keys:** Issue "Project Keys" that map to real upstream keys, allowing rotation without breaking clients.

## 4. Detailed Tech Implementation Specs

### 4.1. Fastify Server Structure
```javascript
// src/server.js
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import pino from 'pino';

const server = Fastify({
  logger: pino({ level: 'info' }),
  disableRequestLogging: true // Custom logging via hook for speed
});

// Setup Zod validation
server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

// Register Plugins
await server.register(import('./routes/v1/chat.js'));
await server.register(import('./routes/v1/models.js'));
await server.register(import('./plugins/redis.js'));
```

### 4.2. Semantic Caching Logic
1. **Hash Generation:** `hash = sha256(normalize(prompt))` (Fast, exact match).
2. **Vector Embedding:** If exact match fails, generate embedding (using small local model or API).
3. **Similarity Search:** Query Redis VSS (Vector Similarity Search).
4. **Hit:** Return `cached_response`.
5. **Miss:** Forward to LLM -> Store `(embedding, response)` in Redis.

### 4.3. Unified Provider Interface
We will standardize all upstream interactions into a strictly typed interface:

```typescript
interface ILlmProvider {
  id: string;
  provider: 'openai' | 'gemini' | 'anthropic';
  generate(payload: OpenAIPayload): Promise<OpenAIResponse>;
  stream(payload: OpenAIPayload): AsyncGenerator<OpenAIChunk>;
  healthCheck(): Promise<boolean>;
}
```
*Note: All "weird" logic (converting OpenAI format to Gemini) happens inside the specific Provider class, hidden from the core router.*

## 5. Risk Assessment & Migration Strategy
- **Risk:** Breaking existing clients during migration.
- **Mitigation:**
    1. Build Fastify server on a new port (e.g., `3001`).
    2. Run integration tests suite against both ports.
    3. Use `autocannon` to benchmark performance difference.
    4. Switch traffic once parity is confirmed.

---
**Recommendation:** Start immediately with **Phase 1 (Fastify/Zod/Undici)** to establish the high-performance baseline.
