---
name: package-structure
description: Enforces the feature-folder package structure for API projects, with dependency inversion through interfaces and a composition root. Use when creating an API project, adding a domain or endpoint, or moving, naming, or reviewing files in one.
---

# Package structure

Each domain (book, author, order) owns a feature folder in `src/` holding everything about it: its interfaces, its types, and the classes that implement them. Classes depend on interfaces, never on each other, and one file, the composition root, creates the concrete classes and injects them.

## Layout

```
<api>/
├── package.json
├── postman/
│   └── <api>.postman_collection.json
├── database/
│   └── connection.ts                opens the database and exports the connection
└── src/
    ├── server.ts                    composition root
    ├── shared/
    │   ├── errors.ts
    │   └── validation.ts
    └── book/                        one feature folder per domain
        ├── interface/
        │   ├── bookRepository.ts    interface BookRepository
        │   └── bookService.ts       interface BookService
        ├── bookTypes.ts
        ├── sqliteBookRepository.ts  class SqliteBookRepository implements BookRepository
        ├── bookServiceImpl.ts       class BookServiceImpl implements BookService
        └── bookController.ts        class BookController
```

- **`postman/`** holds the API's Postman collections and environments.
- **`database/`** holds the connection, plus schema and seed files when the project has them. Queries belong in the repository implementations, not here.
- **`src/shared/`** holds code used by several domains and owned by none: error types, validation helpers. Domain logic stays out of it.
- **Contract files** (a WSDL generator, `.proto` files, a GraphQL schema) describe the whole API, so they sit outside the feature folders, where the protocol's tooling expects them.
- **File names** follow the language's convention: `bookController.ts` in TypeScript, `book_controller.py` in Python. The roles and the dependency rule stay the same.

## Roles

| File | Role | Depends on |
|---|---|---|
| `<domain>Controller` | Entry point to the domain: takes the protocol's request (REST route, SOAP operation, gRPC method, GraphQL resolver), checks its shape, calls the service, maps the result and errors to the protocol's response | `<Domain>Service` interface |
| `<domain>ServiceImpl` | Business rules | Repository interfaces, its own and other domains' |
| `<technology><Domain>Repository` | Data access: every query for the domain's table | `database/connection` |
| `<domain>Types` | The domain's data types: the stored row, the fields without id, the entity with id | Nothing |
| `interface/` | The contracts the domain's classes implement and its consumers depend on | `<domain>Types` |
| `src/server.ts` | Composition root: creates repositories, then services, then controllers, injecting each into the next, and mounts the controllers | Everything concrete |

Name a repository implementation after its technology (`SqliteBookRepository`, `InMemoryBookRepository`) and a service implementation `<Domain>ServiceImpl`.

## The dependency rule

```
BookController ──► BookService ◄── BookServiceImpl ──► BookRepository ◄── SqliteBookRepository
```

- Constructors receive their dependencies as interfaces. Repositories, services, and controllers are created with `new` only in `src/server.ts`.
- When one domain needs another's data, its service takes the other domain's repository interface as a constructor parameter. An author service that refuses to delete an author with books takes a `BookRepository`.
- Controllers reach data only through a service.
- `database/connection` is imported only by repository implementations.

```ts
export interface BookRepository {
    findById(id: number): Book | undefined;
    countByAuthorId(authorId: number): number;
}

export class AuthorServiceImpl implements AuthorService {
    constructor(
        private readonly authors: AuthorRepository,
        private readonly books: BookRepository,
    ) {}
}
```

```ts
const bookRepository = new SqliteBookRepository(db);
const authorRepository = new SqliteAuthorRepository(db);

const bookController = new BookController(new BookServiceImpl(bookRepository, authorRepository));
const authorController = new AuthorController(new AuthorServiceImpl(authorRepository, bookRepository));
```

## Steps

### Adding a domain

1. Create `src/<domain>/` with `interface/<domain>Repository.ts`, `interface/<domain>Service.ts`, and `<domain>Types.ts`.
2. Write the implementations against those interfaces: the repository, the service implementation, and the controller.
3. Wire them in `src/server.ts` and mount the controller.
4. Add the domain's requests to the collection in `postman/`.

Done when the domain's controller is mounted in `src/server.ts` and every row of the Roles table has its file.

### Adding an endpoint or operation

Add the method to the service interface first, then implement it in the service, then call it from the controller. Add a repository method, interface first, only when the service needs data the existing methods don't return.

### Existing projects

A project with another layout keeps it until the user asks to restructure. Put new domains in the new layout only after the user agrees, and ask before moving existing files.

## Check

Before finishing, search the imports in the files you changed. Done when every check holds:

- `new` of a repository, service, or controller class appears only in `src/server.ts`.
- Imports of a `*Impl` class or a technology-named repository (`Sqlite*`, `Postgres*`, `InMemory*`) appear only in `src/server.ts` and in tests.
- Imports of `database/connection` appear only in repository implementations.
- Controllers import services through `interface/`, and nothing in a controller imports a repository.
- Each repository and service class implements the interface in its domain's `interface/` folder.
