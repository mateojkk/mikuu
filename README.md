# payme

> send money to anyone on tempo.

payme is a peer-to-peer payment app built on the Tempo testnet. send stablecoins to friends directly from your wallet, look up contacts by email or phone, or blast payments to multiple people at once.

built for the Canteen x Tempo Hackathon 2026.

## the problem

sending crypto to another person is harder than it should be. you need their wallet address (a long hex string), you can only send one transaction at a time, and there's no easy way to tell someone "you owe me $20."

## what payme does

**send** - pick a friend from your address book (or paste their wallet), enter an amount, and transfer stablecoins directly on Tempo. the transfer happens on-chain in a few seconds.

**request** - generate a payment link and share it. the other person opens it, connects their wallet, and pays. no back-and-forth needed.

**multi-send** - send to multiple people at once. each transfer fires in parallel with live status tracking per recipient.

**batch send** - bundle multiple transfers into one atomic transaction using Multicall3. everything succeeds or everything fails. if Multicall3 is not available on the chain, it falls back to parallel sends automatically.

**contacts** - save your friends with their name, wallet address, email, and phone number. look up contacts by email or phone when sending payments.

**memos** - attach a note to any payment. quick-tap shortcuts for common ones like dinner, coffee, rent.

## security

- wallet auth on every mutating API call (X-Wallet-Address header)
- ownership checks on delete (you can only delete your own invoices and contacts)
- rate limiting: 60 requests per minute per IP
- address validation on both frontend and backend (0x + 40 hex characters)
- transaction simulation before sending to catch reverts early

## tech stack

| layer | tech |
|-------|------|
| frontend | react 19, vite, typescript, rainbowkit, wagmi, viem |
| backend | python 3, fastapi, pydantic |
| database | sqlite locally, postgresql in production |
| chain | tempo testnet, moderato, chain id 42431 |
| deploy | vercel |

## running locally

backend:
```bash
cd backend
pip install -r requirements.txt
python main.py
```
runs on http://localhost:8080

frontend:
```bash
cd frontend
npm install
npm run dev
```
runs on http://localhost:5173

## project layout

```
backend/
  main.py          - fastapi app + middleware
  routes.py        - invoice and contact endpoints
  middleware.py     - rate limiter + wallet auth
  database.py      - sqlite/postgres with migrations
  models.py        - pydantic request models
  config.py        - env vars

frontend/src/
  App.tsx           - main shell + navigation
  api.ts            - shared auth + address validation
  components/
    InvoiceForm.tsx     - send or request payments
    PaymentPage.tsx     - pay an invoice on-chain
    InvoiceHistory.tsx  - past invoices + search
    Contacts.tsx        - address book
    MultiSend.tsx       - parallel multi-recipient transfers
    BatchSend.tsx       - atomic batch via multicall3
    Receipt.tsx         - post-payment receipt
```

## api

| method | endpoint | auth required | what it does |
|--------|----------|---------------|--------------|
| POST | /api/invoices | yes | create invoice |
| GET | /api/invoices | no | list invoices |
| GET | /api/invoices/:id | no | get one invoice |
| DELETE | /api/invoices/:id | yes | delete (owner only) |
| POST | /api/invoices/:id/pay | yes | mark as paid |
| GET | /api/contacts | no | list contacts |
| GET | /api/contacts/lookup | no | find by email or phone |
| POST | /api/contacts | yes | add contact |
| DELETE | /api/contacts/:id | yes | delete (owner only) |

## env

create backend/.env:
```
DB_PATH=payme.db
FRONTEND_BASE_URL=http://localhost:5173
TEMPO_CHAIN_ID=42431
TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
PORT=8080
```

---

built by MATEOINRL for the canteen x tempo hackathon 2026.
