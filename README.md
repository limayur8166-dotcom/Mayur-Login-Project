# MAYUR – Auth with MongoDB Atlas

## Project Structure

```
nexus/
├── public/
│   ├── index.html      ← Login / Register UI  (updated)
│   └── main.html       ← Dashboard            (updated)
├── server.js           ← Express API
├── package.json
├── .env.example        ← Copy to .env and fill in your values
└── README.md
```

---

## 1 · Create a MongoDB Atlas Cluster (free tier)

1. Go to https://cloud.mongodb.com → **Create a free account**
2. Click **Build a Database** → choose **M0 Free** → pick a region → click **Create**
3. In **Security Quickstart**:
   - Add a **database user** (username + password – save these)
   - Add your IP to the **allow-list** (`0.0.0.0/0` allows all IPs for development)
4. Click **Connect** → **Drivers** → **Node.js** → copy the connection string

   It looks like:
   ```
   mongodb+srv://myUser:myPassword@cluster0.abc12.mongodb.net/?retryWrites=true&w=majority
   ```

---

## 2 · Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and set:

```
MONGO_URI=mongodb+srv://myUser:myPassword@cluster0.abc12.mongodb.net/nexus?retryWrites=true&w=majority
JWT_SECRET=some-very-long-random-secret
PORT=3000
```

> **Never commit `.env` to Git.** Add it to `.gitignore`.

---

## 3 · Install dependencies & run

```bash
npm install          # install Express, Mongoose, bcrypt, JWT, cors, dotenv
npm run dev          # hot-reload with nodemon
# or
npm start            # production start
```

The server starts at **http://localhost:3000**.  
Static files (`index.html`, `main.html`) are served from the `public/` folder.

---

## 4 · API endpoints

| Method | Path           | Body                              | Returns                        |
|--------|----------------|-----------------------------------|--------------------------------|
| POST   | `/api/register`| `{username, email, password}`    | `{token, user}`                |
| POST   | `/api/login`   | `{username, password}`           | `{token, user}`                |
| GET    | `/api/me`      | —                                 | Full user object (JWT required)|

### Example – Register

```js
const res = await fetch('http://localhost:3000/api/register', {
  method : 'POST',
  headers: { 'Content-Type': 'application/json' },
  body   : JSON.stringify({
    username: 'alice',
    email   : 'alice@example.com',
    password: 'Secret123!'
  })
});
const { token, user } = await res.json();
localStorage.setItem('nexus_token', token);
localStorage.setItem('nexus_user',  JSON.stringify(user));
```

### Example – Login

```js
const res = await fetch('http://localhost:3000/api/login', {
  method : 'POST',
  headers: { 'Content-Type': 'application/json' },
  body   : JSON.stringify({ username: 'alice', password: 'Secret123!' })
});
const { token, user } = await res.json();
```

### Example – Protected request (send JWT)

```js
const res = await fetch('http://localhost:3000/api/me', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('nexus_token') }
});
const me = await res.json();   // { username, email, dob, ... }
```

---

## 5 · How the auth flow works

```
Browser               Server                 MongoDB Atlas
  │                     │                         │
  │── POST /register ──▶│                         │
  │   {username,email,  │── bcrypt.hash(pw) ──▶  │
  │    password}        │── User.create(…) ──────▶│── INSERT user
  │                     │◀── saved doc ───────────│
  │◀── {token, user} ───│                         │
  │  (JWT signed)       │                         │
  │                     │                         │
  │── POST /login ─────▶│                         │
  │   {username,pw}     │── User.findOne() ──────▶│── FIND user
  │                     │◀── user doc ────────────│
  │                     │── bcrypt.compare(pw,hash)
  │◀── {token, user} ───│  (match → sign JWT)     │
  │                     │                         │
  │── GET /api/me ──────▶  (Authorization: Bearer …)
  │   (JWT in header)   │── jwt.verify(token)     │
  │                     │── User.findById() ──────▶│── FIND user
  │◀── user profile ────│                         │
```

---

## Security notes

- Passwords are hashed with **bcrypt** (cost 12) – never stored in plain text
- JWTs expire in **7 days** – rotate `JWT_SECRET` periodically
- Timing-safe comparison prevents **user enumeration** during login
- In production: serve over **HTTPS**, store `JWT_SECRET` in a secret manager

---

## Deploying to production

| Platform | Command |
|----------|---------|
| Render   | Connect GitHub repo, set env vars in dashboard |
| Railway  | `railway up` after `railway login` |
| Fly.io   | `fly launch` then `fly secrets set MONGO_URI=…` |

Change the `API` constant in `index.html` from `http://localhost:3000/api`
to your deployed URL once live.
