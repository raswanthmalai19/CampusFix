# CampusFix

**CampusFix** is a full-stack web application for managing and resolving campus-related issues. Students can report problems (mess, sanitation, infrastructure, hostel, academics, etc.), and assigned supervisors resolve them — all with real-time tracking, role-based access, file uploads, email notifications, and a gamified credit system that incentivises quick resolution.

---

## Features

### Role-based Access Control
| Role | Capabilities |
|------|-------------|
| **Admin** | Add supervisors, create/assign categories, view all issues and users |
| **Supervisor** | View and manage issues in their assigned categories, earn credits |
| **User** | Report issues, upload media, comment, upvote/downvote |

### Issue Lifecycle
```
Pending → Processing → Completed / Rejected
```
Each issue moves through clear status stages with full audit history.

### Category-based Assignment
Supervisors are assigned to specific categories (Mess, Sanitation, Infrastructure, Hostel, Academic) and only see issues relevant to them.

### File Uploads
Users can attach images or videos to issues. Files are stored securely on **Azure Blob Storage**.

### Comments & Voting
Users can discuss issues through comments and upvote/downvote to signal priority.

### Supervisor Credit System
- Every supervisor starts with a shared credit pool.
- Resolving an issue earns the supervisor **10% credits** redistributed from all other supervisors.
- Creates healthy competition and accountability.

### Email Notifications
Automated emails via the **Resend API** are sent when an issue status changes to completed.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL (Neon DB) |
| **File Storage** | Azure Blob Storage |
| **Email** | Resend API |
| **Auth** | JWT + bcryptjs |
| **Frontend** | Vanilla HTML / CSS / JS |
| **Hosting** | Render |

---

## Architecture

```
          ┌────────────────────┐
          │     Frontend       │
          │  (HTML / CSS / JS) │
          └────────┬───────────┘
                   │
         REST API Calls (HTTPS)
                   │
          ┌────────▼───────────┐
          │     Backend        │
          │ (Node.js + Express)│
          └────────┬───────────┘
     ┌─────────────┼──────────────────┐
     │             │                  │
┌────▼─────┐ ┌─────▼──────┐  ┌───────▼──────┐
│ Neon DB  │ │ Azure Blob │  │ Resend Email │
│PostgreSQL│ │  Storage   │  │ Notification │
└──────────┘ └────────────┘  └──────────────┘
```

---

## Database Schema (PostgreSQL)

- `users` — stores all users with roles (`user`, `supervisor`, `admin`) and credits
- `categories` — issue categories (Mess, Sanitation, Infrastructure, etc.)
- `issues` — core table with status, votes, category, assigned supervisor
- `issue_votes` — tracks per-user upvote/downvote per issue
- `comments` — threaded comments on issues
- `supervisor_categories` — maps supervisors to their assigned categories
- `credit_transactions` — audit trail for supervisor credit rewards and distributions

---

## Getting Started

### Prerequisites
- Node.js v18+
- PostgreSQL database (or a [Neon DB](https://neon.tech) connection string)
- Azure Storage account
- Resend API key

### 1. Clone the Repository
```bash
git clone https://github.com/raswanthmalai19/CampusFix.git
cd CampusFix
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:
```env
DATABASE_URL=your_neon_postgres_connection_string
JWT_SECRET=your_jwt_secret
AZURE_STORAGE_CONNECTION_STRING=your_azure_storage_connection_string
RESEND_API_KEY=your_resend_api_key
PORT=3000
```

### 4. Set Up the Database
Run the SQL schema against your PostgreSQL database:
```bash
psql $DATABASE_URL -f postgre.sql
```

### 5. Start the Server
```bash
npm start
```
The server will run at `http://localhost:3000`.

---

## Project Structure

```
CampusFix/
├── post.js          # Main Express server — all routes and API logic
├── listblob.js      # Azure Blob Storage utility
├── postgre.sql      # Full PostgreSQL schema + seed data
├── package.json
└── public/
    ├── index.html       # Landing / login page
    ├── user.html        # User dashboard
    ├── supervisor.html  # Supervisor dashboard
    ├── admin.html       # Admin panel
    └── profile.html     # User profile page
```

---

## API Overview

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/register` | Public | Register a new user |
| POST | `/api/auth/login` | Public | Login and receive JWT |
| GET | `/api/issues` | User+ | List all issues |
| POST | `/api/issues` | User | Report a new issue |
| PATCH | `/api/issues/:id/status` | Supervisor | Update issue status |
| POST | `/api/issues/:id/vote` | User | Upvote or downvote an issue |
| POST | `/api/issues/:id/comments` | User+ | Add a comment |
| GET | `/api/admin/users` | Admin | List all users |
| POST | `/api/admin/supervisors` | Admin | Add a supervisor |

---

## Future Enhancements

- Progressive Web App (PWA) support
- Real-time notifications via WebSockets
- Analytics dashboard for admins
- Student verification flow for completed issues
- Mobile-first responsive redesign

---

## License

ISC
