# AIClient-2-API: Fastify Edition (Phase 1)

This is the high-performance upgrade of the API server, built with **Fastify**, **Undici**, and **Zod**.

## Key Features
- **Fastify**: High-throughput web framework (2-4x faster than Express/HTTP).
- **Undici**: Modern HTTP client for faster upstream connections.
- **Zod**: Strict, type-safe schema validation for all inputs.
- **Pino**: Asynchronous, zero-blocking logging.

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Server
The new server runs on port **3001** by default to allow side-by-side testing with the old server.

```bash
node src/server-fastify.js
```

### 3. API Endpoints

- **Health Check**: `GET /health`
- **Chat Completions**: `POST /v1/chat/completions`
  - Fully compatible with OpenAI API format.
  - Requires `OPENAI_API_KEY` in `config.json`.

## Configuration
The server uses the existing `config.json`. Ensure your keys are valid.

## Next Steps (Phase 2)
- Integrate Redis for state management.
- Add "Least Busy" load balancing.
- Implement Semantic Caching.
