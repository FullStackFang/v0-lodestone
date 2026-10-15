## ADDED Requirements

### Requirement: A health route

The system SHALL answer `GET /api/lodestone/health` without authentication
with `{ ok, db, migrations, embedder, mail }`, each a boolean. `db` is a
successful trivial query; `migrations` is whether the newest file in
`./drizzle` has been applied; `embedder` and `mail` are whether their
variables are set. `ok` is the conjunction. The body SHALL carry no versions,
counts or hostnames.

#### Scenario: Healthy
- **WHEN** the database answers, migrations are current and both keys are set
- **THEN** the response is 200 with every field true

#### Scenario: Behind on migrations
- **WHEN** a migration file exists that is not in the migrations table
- **THEN** `migrations` is false and `ok` is false, with status 503

### Requirement: Production migrates by release step only

`npm run db:migrate` SHALL apply `./drizzle` to the database named by
`DATABASE_URL_UNPOOLED` when set, else `DATABASE_URL`, and exit nonzero on
failure. The app SHALL NOT migrate on connect when `NODE_ENV=production`.

#### Scenario: Idempotent
- **WHEN** `db:migrate` runs twice against the production branch
- **THEN** the second run applies nothing and exits 0

### Requirement: The seed never touches a remote database

`npm run lodestone:seed` SHALL exit before opening a connection when
`NODE_ENV=production` or when `DATABASE_URL` names a host other than
localhost.

#### Scenario: A production URL in a local shell
- **WHEN** the seed runs with `DATABASE_URL` pointing at a Neon host
- **THEN** it exits 1 naming the host and writes nothing

### Requirement: A live deployment

A Vercel project on this repository SHALL serve Lodestone at the hostname
Whetstone defaults to, backed by Postgres with pgvector, with every variable
in `.env.example` outside the Optional block set for Production, Resend
delivering sign-in mail, and the digest cron scheduled with `CRON_SECRET`.

#### Scenario: First sign-in
- **WHEN** the owner requests a magic link on the production login page
- **THEN** a Resend email arrives and the link signs them in

#### Scenario: First card
- **WHEN** an enrolled member mints a token, points Whetstone at the server
  and sends a card
- **THEN** `GET /api/lodestone/cards/<id>` returns prior art against the
  ingested corpus and the card can be published

#### Scenario: The digest runs
- **WHEN** the cron route is hit with the secret
- **THEN** one email per card owner is sent; without the secret the route
  answers 401
