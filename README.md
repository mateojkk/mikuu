# mikuu

> confidential p2p payments on tempo.

mikuu is an open-source, production-ready peer-to-peer payment app for stablecoins on the Tempo network.

## 🚀 features

- **p2p transfers**: send stablecoins directly to any wallet.
- **smart address book**: save and look up contacts by email or phone.
- **bulk payments**: send to multiple recipients in parallel or via atomic multicall3 batches.
- **payment links**: generate shareable request links for easy settlement.
- **security**: wallet-based authentication, ownership checks, and rate limiting.

## 🛠 tech stack

- **frontend**: react 19, vite, rainbowkit, wagmi, viem.
- **backend**: fastapi (python 3.12).
- **database**: postgresql.
- **infrastructure**: vercel.

## 💻 getting started

### backend
```bash
cd api && pip install -r requirements.txt && python index.py
```

### frontend
```bash
cd frontend && npm install && npm run dev
```

## 🔐 environment vars
Requires `DATABASE_URL` (Postgres) and `FRONTEND_BASE_URL` in production for full functionality.

---
built by MATEOINRL.
