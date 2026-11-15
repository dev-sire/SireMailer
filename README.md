<p align="center">
  <img src="docs/logo-banner.png" alt="SireMailer" width="380">
</p>

<p align="center">
  <b>A self-hosted email campaign platform for Gmail.</b><br>
  Send personalised mail one message at a time, track every campaign, and pick up exactly where you left off.
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="Python" src="https://img.shields.io/badge/backend-Flask-black">
  <img alt="Next.js" src="https://img.shields.io/badge/frontend-Next.js-black">
  <img alt="Docker" src="https://img.shields.io/badge/deploy-Docker-2496ED">
</p>

---

## Overview

SireMailer is built for event organisers and small teams who need to email hundreds or thousands of people (participants, attendees, members) from a Gmail or Google Workspace account without handing their list to a third-party service.

Mails go out slowly and individually, the way a person would send them, which keeps the sending pattern natural. Large lists are expected to span several days because of Gmail's daily limits, so every recipient's status is stored in a database and a campaign can be resumed at any time without anyone being mailed twice.

## Features

- **Campaign dashboard.** Progress bars, sent, remaining and failed counts, estimated time left, and total sending time for every campaign.
- **Resume anytime.** Progress is saved per recipient in SQLite. Restart the app, shut down your machine, or continue the next day. Only contacts not yet mailed are sent to.
- **One mail at a time.** Messages are sent individually with a randomised pause between them, not as a bulk blast.
- **Personalisation.** HTML templates with `{{name}}`, `{{first_name}}` and `{{email}}`, in both the body and the subject.
- **Built for deliverability.** Every mail includes a plain-text alternative, a `List-Unsubscribe` header, a Reply-To address and a Message-ID on your own domain.
- **Saved senders.** Enter your Gmail app password once. It is stored encrypted and never shown again.
- **Daily limit guard.** Each sender has a configurable limit per rolling 24 hours. Campaigns pause before Gmail blocks the account.
- **Safe CSV import.** Invalid and duplicate addresses are skipped automatically.
- **Test before you send.** Send a rendered test mail to yourself from any campaign.
- **One-command setup.** The whole stack runs with Docker Compose.

## Quick start

**Requirements:** Docker with Compose v2, and a Google account with 2-Step Verification enabled.

```bash
git clone https://github.com/<your-username>/sire-mailer.git
cd sire-mailer
docker compose up -d --build
```

Open **http://localhost:3000**.

### 1. Create a Google app password

1. Turn on 2-Step Verification for the sending account.
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) and create a password named "SireMailer".
3. Copy the 16-character code. Spaces are ignored.

### 2. Add a sender

Open **Senders**, enter the Gmail address, the app password, a display name and a daily limit. SireMailer verifies the login with Gmail before saving it.

### 3. Create a campaign

Open **New campaign** and provide:

| Field | Notes |
| --- | --- |
| Name | For your own reference. |
| Sender | One of your saved senders. |
| Subject | Supports template variables. |
| Delay | Seconds between mails. A random extra of up to 50% is added to each gap. |
| Recipients CSV | Header row with `name` and `email` columns. |
| HTML template | Pasted or loaded from a `.html` file. |

Example CSV:

```csv
name,email
Ayesha Khan,ayesha@example.com
Bilal Ahmed,bilal@example.com
```

Template variables:

| Variable | Value |
| --- | --- |
| `{{name}}` | Full name from the CSV (falls back to "there" if empty). |
| `{{first_name}}` | First word of the name. |
| `{{email}}` | The recipient's address. |

### 4. Send

Open the campaign, use **Send test to myself** to check the layout and spam placement, then press **Start sending**. Keep the machine running while it sends.

### 5. Resume on the next day

When the daily limit is reached, or whenever you pause, the campaign stops with its progress saved.

```bash
docker compose up -d
```

Open the campaign and press **Resume**. Failed mails are retried at that point.

## Gmail limits

| Account type | Approximate limit |
| --- | --- |
| Free Gmail | 500 recipients per day |
| Google Workspace | 2,000 recipients per day |

The default sender limit is 450 per rolling 24 hours, leaving headroom. Adjust it per sender. A list of 1,000 recipients on a free account therefore takes about three days.

Sending slowly helps, but inbox placement mostly depends on content and sender reputation. Avoid link shorteners, image-only mails and all-caps subjects, and include a clear opt-out line in the body. Only email people who have agreed to hear from you.

## Data and security

- All data lives in `./data`: the SQLite database (`sire.db`) and the encryption key (`secret.key`). **Back this folder up.** Deleting it removes every campaign and sender.
- App passwords are encrypted at rest with [Fernet](https://cryptography.io/en/latest/fernet/) using the key in `secret.key`. Anyone with both files can recover the passwords, so protect the folder.
- **There is no login.** The app is bound to `127.0.0.1` and is meant for a single trusted user on their own machine. Do not expose port 3000 to the internet. If you host it, put authentication in front of it first.

## How it works

```
Browser ──► Next.js (3000) ──/api──► Flask + Gunicorn ──► SQLite (./data)
                                          │
                                          └──► smtp.gmail.com:587 (STARTTLS)
```

- The frontend proxies `/api/*` to the backend, so the backend is never exposed on a host port.
- Each campaign runs in a background thread that picks the next pending recipient, sends it over a fresh SMTP session, records the result, and waits.
- Only one campaign can send at a time. The backend runs a single worker process because live state is held in memory.
- On startup, any campaign left marked as running is set to paused, since the restart interrupted it.

## Project structure

```
sire-mailer/
├── backend/            Flask API, sending worker, SQLite schema (app.py)
├── frontend/           Next.js + Tailwind dashboard
│   └── app/            Pages: dashboard, campaigns, senders
├── docs/               README assets
├── docker-compose.yml
└── data/               Created on first run (git-ignored)
```

## Local development

Without Docker, run the two services separately.

```bash
# Backend, http://127.0.0.1:5000
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

```bash
# Frontend, http://localhost:3000
cd frontend
npm install
npm run dev
```

| Setting | Where | Default |
| --- | --- | --- |
| `DATA_DIR` | Backend environment variable | `backend/data` locally, `/data` in Docker |
| `BACKEND_URL` | Frontend build argument | `http://backend:5000` in Docker, `http://127.0.0.1:5000` locally |

Local runs and Docker runs use separate data folders, so pick one and stay with it.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Gmail rejected the login" | Use the 16-character app password, not your normal password, and make sure 2-Step Verification is on. |
| "Another campaign is sending right now" | Pause the running campaign first. Only one can send at a time. |
| Campaign shows Paused after a restart | Expected. Open it and press Resume. |
| Campaign paused with a daily limit message | Resume after the 24-hour window frees up capacity. |
| "Cannot reach the backend" | Check that the backend container (or `python app.py`) is running. |
| Port 3000 is already in use | Change the left side of `127.0.0.1:3000:3000` in `docker-compose.yml`. |

## Updating

```bash
git pull
docker compose up -d --build
```

Your data in `./data` is kept across updates.

## Contributing

Issues and pull requests are welcome. For larger changes, please open an issue first to discuss the approach.

## License

Released under the [MIT License](LICENSE).