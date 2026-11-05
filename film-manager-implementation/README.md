# Film Manager – Invitations & Reviews API


## Architecture

The project is structured into the following layers:

- **Controllers**  
  Handle HTTP validation, authentication/authorization, and response construction (including HATEOAS).

- **Services**  
  Contain all business logic: validations, SQL queries, invitation lifecycle, review rules, and expiration handling.

- **OpenAPI (YAML / JSON)**  
  Complete API documentation including schemas, filters, responses, and examples.

- **SQLite Database** 

---

## Running the Server

Install dependencies and start the server:

```
npm install
npm start
```
Open Swagger UI to view the API documentation:
http://localhost:3001/docs


## Testing the App

A Postman collection has been developed to validate the behavior of the
Film Manager API, focusing especially on the invitation and review workflow.

The Postman collection is designed to be executed step by step, following a
realistic usage flow of the application.

## Pagination

To set the number of items per page in API pagination, modify the ELEMENTS_IN_PAGE variable in utils/constants.js.

## Major Design Changes

### Removal of POST Review Creation
- Reviews are now created only through invitations**.
- A user can complete a review only if they have been invited and have accepted the invitation.

---

### Invitation States

An invitation can be in one of the following states:

- `PENDING` – Invitation issued, waiting for acceptance
- `ACCEPTED` – Invitation accepted, review can be completed
- `CANCELLED` – Invitation expired and cancelled
- `COMPLETED` – Review completed (final logical state)

> **Key design decision:**  
> An invitation becomes a review only when it is completed, not when it is accepted.

---

### Implemented Constraints (Invitations)

- [x] A user cannot complete a review if the invitation has not been accepted
- [x] A user cannot receive more than one invitation for the same film
- [x] The film owner cannot invite themselves, neither complete a review for his films because when he create a film adds a rating, similar to a review.
- [x] Only invitations not completed can be deleted
- [x] Cancelled invitations can be overwritten if the user is invited again

---

### Invitation Expiration

#### Behavior

- If `expiresAt` is not provided, the default far-future date is assigned.
- When an invitation expires:
- status = CANCELLED
- cancelledAt = now

- When an invitation is accepted, `expiresAt` is set to `NULL` so it does not appear in expiration-based filters.
- If a user is invited again after a previous invitation was cancelled:
- The existing row is updated
- A new expiration date is assigned

---

## Input Validation for Review Updates

A new JSON Schema called **`review_update_schema.json`** has been introduced to
validate the request body when completing or updating a review.

### Motivation

Originally, the review update endpoint accepted `filmId` and `reviewerId` in the
request body. This led to a potential inconsistency problem, since those values
are already identified by the URL path parameters.

### `review_update_schema` Responsibilities

The new schema validates only the fields that can actually be modified:

- `completed`
- `reviewDate`
- `rating`
- `review`