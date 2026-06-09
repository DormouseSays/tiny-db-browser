This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) with your browser to see the result.

## Configuration

- `TINY_DB_DATA_DIR` — directory uploaded databases are stored in (defaults to `.data/databases`).
- `TINY_DB_PRESET_FILES` — a pre-set list of SQLite files on disk to expose in the 🗄 "open preset database" menu, given as paths separated by the OS path delimiter (`:` on macOS/Linux, `;` on Windows). For example: `TINY_DB_PRESET_FILES=/srv/data/sales.db:/srv/data/people.sqlite`.

## TODO

- fix editing to keep icons on fixed left number column, and not resize if possible

- change to port 8000, 8080 is used for some websocket thing on osx?
