# Film Manager API

A RESTful service for managing films and collaborative reviews, built with Node.js, Express and SQLite, and designed API-first with OpenAPI 3.

Users manage their own films, either private or public. Owners of public films can invite other users to review them. A review only exists once an invited user has accepted the invitation and completed it.

## Features

- **API-first design**: the OpenAPI spec is the source of truth, and the server routes are generated from it with Swagger Codegen / `oas3-tools`.
- **Request validation** with JSON Schema (AJV) on every write endpoint.
- **Session-based authentication** with Passport (local strategy, bcrypt-hashed passwords).
- **Review invitation workflow** with an explicit lifecycle, expiration handling and bulk operations.
- **HATEOAS links** that change with the state of each resource (for example, `accept` only appears on pending invitations).
- **Pagination and filtering** on list endpoints, by status and by expiry, acceptance or cancellation windows.
- **Interactive documentation** through Swagger UI.

## Invitation lifecycle

```
            issue                 accept                complete review
  (none) ─────────▶ PENDING ─────────────▶ ACCEPTED ───────────────────▶ COMPLETED
                       │
                       │ expiresAt reached
                       ▼
                   CANCELLED ── re-invite ──▶ PENDING
```

- An invitation becomes a review only when it is completed, not when it is accepted.
- Owners cannot invite themselves, and a user cannot hold two invitations for the same film.
- Invitations without `expiresAt` never expire. Accepting an invitation clears its expiry.
- Expired invitations are cancelled automatically before every invitation query.
- Invitations can be deleted by the owner as long as the review is not completed.

## Repository structure

| Path | Contents |
| --- | --- |
| [`rest-api-design/`](rest-api-design) | OpenAPI document (YAML and JSON) describing the API |
| [`json-schemas/`](json-schemas) | JSON Schemas for films, users and reviews, with example instances |
| [`film-manager-implementation/`](film-manager-implementation) | The service: controllers, services, SQLite database |
| `Film Manager API.postman_collection.json` | Postman collection that walks through the full invitation and review flow |

The implementation follows a layered layout:

- **Controllers** handle HTTP concerns: authentication checks, status codes and HATEOAS links.
- **Services** hold the business rules and the SQL: invitation lifecycle, review rules and expiration.
- **Components** are the domain models (`Film`, `User`, `Review`, `Invitation`) and the database connection.

## Getting started

Requires Node.js 18+.

```bash
cd film-manager-implementation
npm install
npm start
```

- API: http://localhost:3001/api
- Swagger UI: http://localhost:3001/docs

The bundled SQLite database ships with demo users. Their credentials are listed in `film-manager-implementation/database/passwords_databases.txt`.

The page size used for pagination is set by `ELEMENTS_IN_PAGE` in `film-manager-implementation/utils/constants.js`.

## Main endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/users/authenticator` | Log in |
| `DELETE` | `/api/users/authenticator/current` | Log out |
| `GET` | `/api/films/public` | List public films |
| `POST` | `/api/films` | Create a film |
| `GET` / `PUT` / `DELETE` | `/api/films/private/{filmId}` | Manage one of your private films |
| `GET` / `PUT` / `DELETE` | `/api/films/public/{filmId}` | Manage a public film |
| `GET` / `POST` | `/api/films/public/{filmId}/invitations` | List or issue invitations for a film you own |
| `DELETE` | `/api/films/public/{filmId}/invitations/{reviewerId}` | Delete an invitation that is not completed |
| `GET` | `/api/films/public/invitations` | List the invitations you have received |
| `POST` | `/api/films/public/{filmId}/invitations/accept` | Accept one invitation |
| `POST` | `/api/films/public/invitations/accept` | Accept all your pending invitations |
| `GET` | `/api/films/public/{filmId}/reviews` | List the completed reviews of a film |
| `PUT` | `/api/films/public/{filmId}/reviews/{reviewerId}` | Complete an accepted review |

The full contract, including request and response schemas, is in [`rest-api-design/openapi.yaml`](rest-api-design/openapi.yaml).

More detail on the design decisions is in [`film-manager-implementation/README.md`](film-manager-implementation/README.md).

## Context

This project started in the Distributed Programming course at Politecnico di Torino. The course provided a base Film Manager service: films, users, session authentication, and the Swagger-generated server structure.

On top of that base, this project adds:

- The invitation-based review workflow: issuing invitations, accepting them one at a time or in bulk, deleting them, and completing reviews only after an invitation is accepted. Direct review creation was removed.
- Invitation expiration, with automatic cancellation and re-inviting after a cancellation.
- Filtering by status and by time window, pagination, and state-dependent HATEOAS links on invitation endpoints.
- A dedicated JSON Schema for review updates, so path parameters can't be overridden by the request body.
- The extended OpenAPI specification and a Postman collection that covers the whole flow.
