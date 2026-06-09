This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:8000](http://localhost:8000) with your browser to see the result.

## Opening databases

The menu bar can open a SQLite file (upload ⬆, server 📂, or preset 🗄) or connect
to a remote **Cloudflare D1** database (☁). The D1 button opens a modal for the
account ID, database ID, and an API token with D1 access. The connection is held
in memory on the server only while its tab is open — closing the tab discards the
credentials, and they are never written to disk or returned to the browser. D1
tabs are read/write like local databases but can't be saved to a file.

## Configuration

- `TINY_DB_DATA_DIR` — directory uploaded databases are stored in (defaults to `.data/databases`).
- `TINY_DB_PRESET_FILES` — a pre-set list of SQLite files on disk to expose in the 🗄 "open preset database" menu, given as paths separated by the OS path delimiter (`:` on macOS/Linux, `;` on Windows). For example: `TINY_DB_PRESET_FILES=/srv/data/sales.db:/srv/data/people.sqlite`.

## TODO

- fix editing to keep icons on fixed left number column, and not resize if possible
