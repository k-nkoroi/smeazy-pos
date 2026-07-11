# ── Build stage ───────────────────────────────────────────────────────────────
FROM rust:1.75-slim-bookworm AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY crates/ crates/
COPY migrations/ migrations/

RUN cargo build --release -p smeazy-api

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/smeazy-api /app/smeazy-api
COPY --from=builder /app/migrations /app/migrations

ENV RUST_LOG=info
EXPOSE 8000

CMD ["/app/smeazy-api"]
