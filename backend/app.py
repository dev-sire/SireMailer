import csv, html, io, os, random, re, smtplib, sqlite3, threading, time, uuid
from contextlib import closing
from email.utils import make_msgid

from cryptography.fernet import Fernet
from flask import Flask, jsonify, request
from flask_mail import Mail, Message

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "sire.db")
KEY_PATH = os.path.join(DATA_DIR, "secret.key")

# App passwords are encrypted with a key generated on first run and kept next to the DB.
if not os.path.exists(KEY_PATH):
    with open(KEY_PATH, "wb") as fh:
        fh.write(Fernet.generate_key())
    os.chmod(KEY_PATH, 0o600)
FERNET = Fernet(open(KEY_PATH, "rb").read())

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024
LOCK = threading.Lock()
RUNS = {}  # campaign_id -> live state of the campaign being sent right now
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VAR_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, sender_name TEXT DEFAULT '',
  password_enc BLOB NOT NULL, daily_limit INTEGER DEFAULT 450, created_at REAL);
CREATE TABLE IF NOT EXISTS campaigns(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, account_id INTEGER REFERENCES accounts(id),
  subject TEXT, template TEXT, delay REAL DEFAULT 5, status TEXT DEFAULT 'draft', message TEXT,
  active_seconds REAL DEFAULT 0, created_at REAL, started_at REAL, finished_at REAL);
CREATE TABLE IF NOT EXISTS recipients(
  id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT, email TEXT, status TEXT DEFAULT 'pending', error TEXT, sent_at REAL,
  UNIQUE(campaign_id, email));
CREATE INDEX IF NOT EXISTS idx_rec ON recipients(campaign_id, status);
"""


def db():
    c = sqlite3.connect(DB_PATH, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


def q(sql, args=(), one=False):
    with closing(db()) as c:
        rows = c.execute(sql, args).fetchall()
    return (rows[0] if rows else None) if one else rows


def x(sql, args=()):
    with closing(db()) as c:
        cur = c.execute(sql, args)
        c.commit()
        return cur.lastrowid


with closing(db()) as _c:
    _c.executescript(SCHEMA)
    _c.execute("PRAGMA journal_mode=WAL")
    _have = {r["name"] for r in _c.execute("PRAGMA table_info(campaigns)")}
    for _col in ("cc", "bcc", "reply_to"):
        if _col not in _have:
            _c.execute(f"ALTER TABLE campaigns ADD COLUMN {_col} TEXT DEFAULT ''")
    _c.commit()
# A restart kills any sending thread, so anything still marked running was interrupted.
x("UPDATE campaigns SET status='paused', message='Interrupted by a restart. Resume to continue.' WHERE status='running'")


# ---------- mail helpers ----------

def render(text, ctx, escape=True):
    return VAR_RE.sub(lambda m: (html.escape if escape else str)(ctx.get(m.group(1).lower(), "")), text)


def html_to_text(src):
    src = re.sub(r"(?is)<(script|style|head)[^>]*>.*?</\1>", "", src)
    src = re.sub(r"(?is)<a\s[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", r"\2 (\1)", src)
    src = re.sub(r"(?i)<br\s*/?>|</(p|div|h[1-6]|li|tr)>", "\n", src)
    src = html.unescape(re.sub(r"(?s)<[^>]+>", "", src))
    return re.sub(r"\n\s*\n\s*\n+", "\n\n", src).strip()


def read_recipients(raw):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
    cols = {(c or "").strip().lower(): c for c in (reader.fieldnames or [])}
    if "name" not in cols or "email" not in cols:
        raise ValueError("The CSV needs two columns with the headers: name, email")
    out, seen, skipped = [], set(), 0
    for row in reader:
        name = (row.get(cols["name"]) or "").strip()
        email = (row.get(cols["email"]) or "").strip()
        if not EMAIL_RE.match(email) or email.lower() in seen:
            skipped += 1
            continue
        seen.add(email.lower())
        out.append((name or "there", email))
    if not out:
        raise ValueError("No valid email addresses found in the CSV")
    return out, skipped


def parse_addrs(raw, label, single=False):
    items = [i for i in re.split(r"[;,\s]+", raw or "") if i]
    for i in items:
        if not EMAIL_RE.match(i):
            raise ValueError(f"{label}: '{i}' is not a valid email address")
    if single and len(items) > 1:
        raise ValueError(f"{label} takes a single address")
    return ", ".join(items)


def build_mailer(email, password):
    mini = Flask(f"mailer-{uuid.uuid4().hex}")
    mini.config.update(MAIL_SERVER="smtp.gmail.com", MAIL_PORT=587, MAIL_USE_TLS=True,
                       MAIL_USE_SSL=False, MAIL_USERNAME=email, MAIL_PASSWORD=password)
    return mini, Mail(mini)


def check_login(mini, mail):
    try:
        with mini.app_context(), mail.connect():
            return None
    except smtplib.SMTPAuthenticationError:
        return ("Gmail rejected the login. Use a 16-character app password "
                "(2-Step Verification must be on), not your normal password.")
    except Exception as e:
        return f"Could not connect to Gmail: {e}"


def password_of(a):
    return FERNET.decrypt(a["password_enc"]).decode()


def build_message(c, a, name, email, test=False):
    ctx = {"name": name, "first_name": name.split()[0], "email": email}
    body = render(c["template"], ctx)
    reply = c["reply_to"] or a["email"]
    # A test goes only to the sender, so CC/BCC contacts aren't copied on it.
    cc = [] if test else [i for i in (c["cc"] or "").split(", ") if i]
    bcc = [] if test else [i for i in (c["bcc"] or "").split(", ") if i]
    msg = Message(
        subject=render(c["subject"], ctx, False),
        sender=(a["sender_name"], a["email"]) if a["sender_name"] else a["email"],
        recipients=[(name, email)], cc=cc, bcc=bcc, body=html_to_text(body), html=body, reply_to=reply,
        extra_headers={"List-Unsubscribe": f"<mailto:{reply}?subject=unsubscribe>"})
    msg.msgId = make_msgid(domain=a["email"].split("@")[1])
    return msg


def sent_last_24h(account_id=None):
    sql = ("SELECT COUNT(*) n FROM recipients r JOIN campaigns c ON c.id=r.campaign_id "
           "WHERE r.status='sent' AND r.sent_at>?")
    args = [time.time() - 86400]
    if account_id:
        sql, args = sql + " AND c.account_id=?", args + [account_id]
    return q(sql, args, True)["n"]


# ---------- worker ----------

def worker(cid, stop):
    run, status, message = RUNS[cid], "done", None
    try:
        c = q("SELECT * FROM campaigns WHERE id=?", (cid,), True)
        a = q("SELECT * FROM accounts WHERE id=?", (c["account_id"],), True)
        mini, mail = build_mailer(a["email"], password_of(a))
        with mini.app_context():
            while not stop.is_set():
                r = q("SELECT * FROM recipients WHERE campaign_id=? AND status='pending' ORDER BY id LIMIT 1", (cid,), True)
                if not r:
                    break
                if sent_last_24h(a["id"]) >= a["daily_limit"]:
                    status, message = "paused", f"Daily limit of {a['daily_limit']} mails reached. Resume tomorrow."
                    break
                run["current"] = r["email"]
                try:
                    with mail.connect() as conn:  # short SMTP session per mail; no stale connections
                        conn.send(build_message(c, a, r["name"], r["email"]))
                    x("UPDATE recipients SET status='sent', sent_at=?, error=NULL WHERE id=?", (time.time(), r["id"]))
                except smtplib.SMTPAuthenticationError:
                    status, message = "paused", "Gmail rejected the app password. Update the sender, then resume."
                    break
                except Exception as e:
                    if "5.4.5" in str(e):
                        status, message = "paused", "Gmail's daily sending limit was reached. Resume tomorrow."
                        break
                    x("UPDATE recipients SET status='failed', error=? WHERE id=?", (str(e)[:200], r["id"]))
                run["done"] += 1
                if q("SELECT 1 FROM recipients WHERE campaign_id=? AND status='pending' LIMIT 1", (cid,), True):
                    stop.wait(c["delay"] + random.uniform(0, c["delay"] * 0.5))  # randomised gap
        if status == "done" and q("SELECT 1 FROM recipients WHERE campaign_id=? AND status='pending' LIMIT 1", (cid,), True):
            status = "paused"
    except Exception as e:
        status, message = "paused", str(e)[:200]
    finally:
        now = time.time()
        x("UPDATE campaigns SET status=?, message=?, active_seconds=active_seconds+?, finished_at=? WHERE id=?",
          (status, message, now - run["started"], now if status == "done" else None, cid))
        RUNS.pop(cid, None)


# ---------- views ----------

def view(c):
    s = {r["status"]: r["n"] for r in q("SELECT status, COUNT(*) n FROM recipients WHERE campaign_id=? GROUP BY status", (c["id"],))}
    sent, failed, pending = s.get("sent", 0), s.get("failed", 0), s.get("pending", 0)
    run, now, eta = RUNS.get(c["id"]), time.time(), None
    active = c["active_seconds"] + (now - run["started"] if run else 0)
    if run:
        per = (now - run["started"]) / run["done"] if run["done"] else c["delay"] * 1.25 + 1
        eta = round(pending * per)
    acct = q("SELECT email FROM accounts WHERE id=?", (c["account_id"],), True)
    return {"id": c["id"], "name": c["name"], "status": c["status"], "message": c["message"],
            "subject": c["subject"], "delay": c["delay"], "total": sent + failed + pending,
            "sent": sent, "failed": failed, "pending": pending, "active_seconds": round(active),
            "eta_seconds": eta, "current": run["current"] if run else None,
            "created_at": c["created_at"], "finished_at": c["finished_at"],
            "account_email": acct["email"] if acct else None}


def get_campaign(cid):
    return q("SELECT * FROM campaigns WHERE id=?", (cid,), True)


# ---------- sender accounts ----------

@app.get("/api/accounts")
def list_accounts():
    rows = q("SELECT a.id, a.email, a.sender_name, a.daily_limit, "
             "(SELECT COUNT(*) FROM campaigns c WHERE c.account_id=a.id) AS campaigns "
             "FROM accounts a ORDER BY a.id")
    return jsonify([dict(r) for r in rows])


@app.post("/api/accounts")
def save_account():
    d = request.get_json(silent=True) or {}
    email, pw = (d.get("email") or "").strip(), (d.get("password") or "").replace(" ", "")
    if not EMAIL_RE.match(email) or not pw:
        return jsonify(error="Enter the Gmail address and its app password"), 400
    try:
        limit = max(1, int(d.get("daily_limit") or 450))
    except ValueError:
        return jsonify(error="Daily limit must be a number"), 400
    problem = check_login(*build_mailer(email, pw))
    if problem:
        return jsonify(error=problem), 400
    enc, name = FERNET.encrypt(pw.encode()), (d.get("sender_name") or "").strip()
    if q("SELECT 1 FROM accounts WHERE email=?", (email,), True):  # saving again updates the password
        x("UPDATE accounts SET password_enc=?, sender_name=?, daily_limit=? WHERE email=?", (enc, name, limit, email))
    else:
        x("INSERT INTO accounts(email, sender_name, password_enc, daily_limit, created_at) VALUES(?,?,?,?,?)",
          (email, name, enc, limit, time.time()))
    return jsonify(ok=True), 201


@app.patch("/api/accounts/<int:aid>")
def edit_account(aid):
    a = q("SELECT * FROM accounts WHERE id=?", (aid,), True)
    if not a:
        return jsonify(error="Sender not found"), 404
    d = request.get_json(silent=True) or {}
    email = (d.get("email") or a["email"]).strip()
    pw = (d.get("password") or "").replace(" ", "")
    name = (d.get("sender_name", a["sender_name"]) or "").strip()
    try:
        limit = max(1, int(d.get("daily_limit") or a["daily_limit"]))
    except ValueError:
        return jsonify(error="Daily limit must be a number"), 400
    if not EMAIL_RE.match(email):
        return jsonify(error="Enter a valid Gmail address"), 400
    if email != a["email"]:
        if q("SELECT 1 FROM accounts WHERE email=? AND id!=?", (email, aid), True):
            return jsonify(error="Another sender already uses that address"), 409
        if not pw:
            return jsonify(error="Enter the app password for the new address"), 400
    for cid in list(RUNS):
        row = q("SELECT account_id FROM campaigns WHERE id=?", (cid,), True)
        if row and row["account_id"] == aid:
            return jsonify(error="A campaign is sending from this sender. Pause it first."), 409
    enc = a["password_enc"]
    if pw:
        problem = check_login(*build_mailer(email, pw))
        if problem:
            return jsonify(error=problem), 400
        enc = FERNET.encrypt(pw.encode())
    x("UPDATE accounts SET email=?, sender_name=?, password_enc=?, daily_limit=? WHERE id=?", (email, name, enc, limit, aid))
    return jsonify(ok=True)


@app.delete("/api/accounts/<int:aid>")
def delete_account(aid):
    if q("SELECT 1 FROM campaigns WHERE account_id=?", (aid,), True):
        return jsonify(error="This sender is used by a campaign, so it can't be removed"), 409
    x("DELETE FROM accounts WHERE id=?", (aid,))
    return jsonify(ok=True)


# ---------- campaigns ----------

@app.get("/api/campaigns")
def list_campaigns():
    return jsonify(campaigns=[view(c) for c in q("SELECT * FROM campaigns ORDER BY id DESC")],
                   sent_24h=sent_last_24h())


@app.post("/api/campaigns")
def create_campaign():
    f, upload = request.form, request.files.get("csv")
    name, subject, template = f.get("name", "").strip(), f.get("subject", "").strip(), f.get("template", "")
    if not (name and subject and template.strip() and upload and f.get("account_id")):
        return jsonify(error="Name, sender, subject, template and CSV are all required"), 400
    if not q("SELECT 1 FROM accounts WHERE id=?", (f["account_id"],), True):
        return jsonify(error="Choose a sender"), 400
    try:
        delay = min(max(float(f.get("delay") or 5), 2.0), 120.0)
        cc, bcc = parse_addrs(f.get("cc"), "CC"), parse_addrs(f.get("bcc"), "BCC")
        reply = parse_addrs(f.get("reply_to"), "Reply-To", single=True)
        people, skipped = read_recipients(upload.read())
    except ValueError as e:
        return jsonify(error=str(e)), 400
    cid = x("INSERT INTO campaigns(name, account_id, subject, template, delay, cc, bcc, reply_to, created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (name, f["account_id"], subject, template, delay, cc, bcc, reply, time.time()))
    with closing(db()) as c:
        c.executemany("INSERT OR IGNORE INTO recipients(campaign_id, name, email) VALUES(?,?,?)",
                      [(cid, n, e) for n, e in people])
        c.commit()
    return jsonify(id=cid, total=len(people), skipped=skipped), 201


@app.get("/api/campaigns/<int:cid>")
def campaign_detail(cid):
    c = get_campaign(cid)
    if not c:
        return jsonify(error="Campaign not found"), 404
    d = view(c)
    d.update(template=c["template"], account_id=c["account_id"], cc=c["cc"] or "", bcc=c["bcc"] or "", reply_to=c["reply_to"] or "")
    d["failures"] = [dict(r) for r in q("SELECT email, error FROM recipients WHERE campaign_id=? AND status='failed' LIMIT 100", (cid,))]
    d["recent"] = [dict(r) for r in q("SELECT email, sent_at FROM recipients WHERE campaign_id=? AND status='sent' ORDER BY sent_at DESC LIMIT 8", (cid,))]
    return jsonify(d)


@app.patch("/api/campaigns/<int:cid>")
def edit_campaign(cid):
    c = get_campaign(cid)
    if not c:
        return jsonify(error="Campaign not found"), 404
    if cid in RUNS:
        return jsonify(error="Pause the campaign before editing it"), 409
    d = request.get_json(silent=True) or {}
    name, subject = (d.get("name", c["name"]) or "").strip(), (d.get("subject", c["subject"]) or "").strip()
    template = d.get("template", c["template"]) or ""
    if not (name and subject and template.strip()):
        return jsonify(error="Name, subject and template can't be empty"), 400
    try:
        delay = min(max(float(d.get("delay", c["delay"])), 2.0), 120.0)
        aid = int(d.get("account_id", c["account_id"]))
    except (TypeError, ValueError):
        return jsonify(error="Delay must be a number and a sender must be chosen"), 400
    if not q("SELECT 1 FROM accounts WHERE id=?", (aid,), True):
        return jsonify(error="Choose a sender"), 400
    try:
        cc, bcc = parse_addrs(d.get("cc", c["cc"]), "CC"), parse_addrs(d.get("bcc", c["bcc"]), "BCC")
        reply = parse_addrs(d.get("reply_to", c["reply_to"]), "Reply-To", single=True)
    except ValueError as e:
        return jsonify(error=str(e)), 400
    x("UPDATE campaigns SET name=?, account_id=?, subject=?, template=?, delay=?, cc=?, bcc=?, reply_to=? WHERE id=?",
      (name, aid, subject, template, delay, cc, bcc, reply, cid))
    return jsonify(ok=True)


@app.post("/api/campaigns/<int:cid>/recipients")
def update_recipients(cid):
    """mode=add keeps everyone and adds new addresses; mode=replace also removes unsent ones missing from the file.
    Contacts already mailed are never removed or re-sent."""
    c = get_campaign(cid)
    if not c:
        return jsonify(error="Campaign not found"), 404
    if cid in RUNS:
        return jsonify(error="Pause the campaign before changing its recipients"), 409
    upload = request.files.get("csv")
    if not upload:
        return jsonify(error="Upload a CSV file"), 400
    try:
        people, skipped = read_recipients(upload.read())
    except ValueError as e:
        return jsonify(error=str(e)), 400
    with closing(db()) as conn:
        have = {r["email"].lower() for r in conn.execute("SELECT email FROM recipients WHERE campaign_id=?", (cid,))}
        new = [(cid, n, e) for n, e in people if e.lower() not in have]
        conn.executemany("INSERT OR IGNORE INTO recipients(campaign_id, name, email) VALUES(?,?,?)", new)
        removed = 0
        if request.form.get("mode") == "replace":
            keep = {e.lower() for _, e in people}
            ids = [(r["id"],) for r in conn.execute("SELECT id, email FROM recipients WHERE campaign_id=? AND status!='sent'", (cid,))
                   if r["email"].lower() not in keep]
            conn.executemany("DELETE FROM recipients WHERE id=?", ids)
            removed = len(ids)
        if new and c["status"] == "done":  # new people to mail, so the campaign is no longer finished
            conn.execute("UPDATE campaigns SET status='paused', finished_at=NULL WHERE id=?", (cid,))
        conn.commit()
    return jsonify(added=len(new), removed=removed, skipped=skipped, existing=len(people) - len(new))


@app.post("/api/campaigns/<int:cid>/start")
def start_campaign(cid):
    c = get_campaign(cid)
    if not c:
        return jsonify(error="Campaign not found"), 404
    a = q("SELECT * FROM accounts WHERE id=?", (c["account_id"],), True)
    with LOCK:
        if RUNS:
            return jsonify(error="Another campaign is sending right now. Pause it first."), 409
        problem = check_login(*build_mailer(a["email"], password_of(a)))
        if problem:
            return jsonify(error=problem), 400
        x("UPDATE recipients SET status='pending', error=NULL WHERE campaign_id=? AND status='failed'", (cid,))  # retry failures
        if not q("SELECT 1 FROM recipients WHERE campaign_id=? AND status='pending' LIMIT 1", (cid,), True):
            return jsonify(error="Nothing left to send"), 400
        now = time.time()
        x("UPDATE campaigns SET status='running', message=NULL, finished_at=NULL WHERE id=?", (cid,))
        stop = threading.Event()
        RUNS[cid] = {"stop": stop, "started": now, "done": 0, "current": None}
        threading.Thread(target=worker, args=(cid, stop), daemon=True).start()
    return jsonify(ok=True)


@app.post("/api/campaigns/<int:cid>/pause")
def pause_campaign(cid):
    if cid in RUNS:
        RUNS[cid]["stop"].set()
    return jsonify(ok=True)


@app.post("/api/campaigns/<int:cid>/test")
def test_campaign(cid):
    c = get_campaign(cid)
    a = c and q("SELECT * FROM accounts WHERE id=?", (c["account_id"],), True)
    if not a:
        return jsonify(error="Campaign not found"), 404
    mini, mail = build_mailer(a["email"], password_of(a))
    try:
        with mini.app_context(), mail.connect() as conn:
            conn.send(build_message(c, a, "Test Participant", a["email"], test=True))
    except Exception as e:
        return jsonify(error=str(e)[:200]), 400
    return jsonify(ok=True, to=a["email"])


@app.delete("/api/campaigns/<int:cid>")
def delete_campaign(cid):
    if cid in RUNS:
        return jsonify(error="Pause the campaign before deleting it"), 409
    x("DELETE FROM campaigns WHERE id=?", (cid,))
    return jsonify(ok=True)

if __name__ == "__main__":
    # Local, non-Docker run. No reloader: it would kill the sending thread on every file save.
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)