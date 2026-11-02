# DDVS – Digital Document Verification System

## Folder structure
    server.js                    backend (API, database, security)
    public/index.html            page shell
    public/css/style.css         all styling
    public/js/core.js            shared helpers
    public/js/home.js            home, login, register
    public/js/citizen.js         citizen dashboard
    public/js/apply.js           new application page
    public/js/detail.js          application details, verification, decisions
    public/js/admin.js           admin/officer dashboard and staff accounts
    public/js/notifications.js   alerts page
    public/js/app.js             start-up and navigation

## Run (Node 22.13+, no npm install needed)
    node server.js        # open http://localhost:3000  (set PORT to change)
The database (ddvs.db) and uploads/ folder are created automatically on first run.

## Default login (only account created automatically)
Super Admin:  admin@ddvs.test   /   Admin@123
Log in, then use "Staff accounts" on the dashboard to create officers, department admins and other super admins.
Citizens register themselves from the home page. Change the default password before any real deployment.

## Rule: deactivating an officer
Unfinished applications of that officer become unassigned (officer name blank). Applications that had only been
assigned return to SUBMITTED; applications already under verification keep their status. An admin then assigns a new officer.
