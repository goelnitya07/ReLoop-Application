# ReLoop — Full-Stack Campus Reuse Marketplace

**Frontend:** HTML, CSS, vanilla JavaScript  
**Backend:** Node.js + Express  
**Database:** MongoDB + Mongoose  
**Authentication:** bcrypt password hashing + JWT

## Features
- Register and log in
- Browse and search active listings
- Create listings with item name, category, wanted item
- View your listings and soft-remove them (status becomes `REMOVED`)
- Smart Swap Matcher using exact, case-insensitive two-way item matching
- Send swap requests; view incoming and outgoing requests
- Accept or reject incoming pending requests
- Accepted requests mark both listings `SWAPPED`
- Responsive custom UI

## Run it
1. Install Node.js LTS and MongoDB Community Server, or prepare a MongoDB Atlas database.
2. Open a terminal in this folder and run:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env`:
   - Windows: `copy .env.example .env`
4. If using local MongoDB, make sure the MongoDB service is running. For Atlas, put your connection string in `.env`:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://127.0.0.1:27017/reloop_db
   JWT_SECRET=replace_this_with_a_long_random_secret
   ```
5. Start the app:
   ```bash
   npm start
   ```
6. Open **http://localhost:3000**.

For development auto-restart, use `npm run dev`.

## API
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` | Current user |
| GET | `/api/listings?search=` | Browse/search |
| POST | `/api/listings` | Create listing (auth required) |
| DELETE | `/api/listings/:id` | Soft-remove own listing |
| GET | `/api/listings/:id/matches` | Find two-way matches |
| POST | `/api/requests` | Send swap request |
| GET | `/api/requests` | View requests |
| PATCH | `/api/requests/:id` | Accept/reject pending request |
| GET | `/api/health` | API health check |

## Collections
- `users`: name, email, password hash
- `listings`: owner, item name, category, wanted item, status
- `swaprequests`: sender, recipient, offered listing, target listing, status

Mongoose creates collections automatically.

## Smart matching example
A offers `Physics Textbook` and wants `Scientific Calculator`. B offers `Scientific Calculator` and wants `Physics Textbook`. ReLoop matches them because each person's wanted item matches the other's offered item. Use consistent item names; matching is exact text after case normalization.

## Limitations
- This is a college-project starter, not production marketplace software.
- JWT is stored in browser `localStorage` for simplicity; production apps may use secure HTTP-only cookies.
- Accepting a swap updates two listings and the request but does not use a MongoDB transaction. Production code should use transactions and handle concurrent acceptances.
- No image upload/chat feature is included, matching the core Java project's scope.
- Replace the sample `JWT_SECRET` and never commit `.env`.
