FMB Thaali Ezzi Sector
======================

Overview
--------
This web app coordinates kidmat (delivery service) for the sector: admins assign
daily delivery turns to eligible members, every member manages their own drop-off
address, everyone can browse the address directory and navigate to each stop from
their current location, personal delivery-route order is saved per member, and a
leaderboard with charts tracks turns taken and kidmat done. It runs entirely as
static files on GitHub Pages backed by Firebase on the free Spark plan (Firebase
Authentication + Firestore only — no Cloud Functions or paid features).

Features
--------
- Firebase Authentication for sign in and sign up (first account becomes admin and
  is auto-approved; every account after that needs admin approval — see below)
- New sign-ups land in a "pending approval" state and see a waiting screen instead
  of the dashboard until an admin approves them from Admin > Members; admins can
  also reject an account, and can flip a member back to pending/rejected/approved
  at any time. Accounts created before this feature shipped have no status field
  and are treated as already approved, so no existing member loses access.
- Admins assign delivery turns to eligible, approved members on a given date,
  reassign, mark complete, or delete turns from the Assign Turns tab
- Members not eligible for kidmat can be flagged from Admin > Members and are
  excluded from turn assignment and the leaderboard
- Each member manages their own name, phone, and drop-off address, plus their own
  account email and password, from the My Profile tab (email/password changes go
  through Firebase Authentication directly, so they show up in the Firebase
  console's Authentication tab, not just Firestore)
- The Directory tab groups members who share the same address into a single stop,
  so a delivery volunteer doesn't visit the same address twice
- Clicking Navigate asks for the browser's current location and opens Google Maps
  turn-by-turn directions from there to the address; falls back to a plain Maps
  search if location access is unavailable or denied
- Members reorder the directory to match their preferred delivery route and save it
- An in-app reminder banner appears when a member has a delivery turn due tomorrow,
  with an optional one-time browser Notification if permission is granted (this is
  foreground/in-app only — the free Spark plan has no background push infrastructure)
- The Leaderboard tab shows a chart and table of turns assigned vs. completed
  (kidmat done) per eligible member
- A directory-changed notice prompts everyone to review their saved order when any
  member's address changes

Firebase setup (Spark / free plan)
-----------------------------------
1. Create a Firebase project (Spark plan is sufficient — no billing required).
2. Enable Email/Password authentication.
3. Enable Firestore Database.
4. Open js/firebase-config.js and replace the sample config with your project settings.
5. In Firestore, these collections are used (created automatically as the app writes
   to them, no manual setup needed):
   - users            (profile, role, approval status, kidmat eligibility, address)
   - turns            (one document per assigned delivery date)
   - userPreferences  (each member's saved directory order)
   - settings         (directory-changed notice flag, doc id "directory")
6. Recommended Firestore security rules (set these in the Firebase console —
   this repo does not deploy rules, since it ships as static files for GitHub
   Pages and has no Firebase CLI/config in the project):
   - Any signed-in user may read all collections.
   - A user may create/update only their own `users/{uid}` document, except the
     `role`, `status`, and `eligibleForKidmat` fields, which only an admin may
     change (this is what makes admin approval a real security boundary rather
     than just a client-side UI gate — without this rule a pending user could
     set their own `status` to "approved" directly).
   - A user may create/update only their own `userPreferences/{uid}` document.
   - Only an admin may create, update, or delete documents in `turns`, except a
     member may update the `status`/`completedAt`/`completedBy` fields on a
     `turns` document that belongs to them (self-service "mark as delivered").
   - Only an admin may write to `settings/directory`, other than the client
     also setting `needsReview: true` when saving their own address.
   Note: email/password changes go through Firebase Authentication's own SDK
   methods (`updateEmail`/`updatePassword` after `reauthenticateWithCredential`),
   which are governed by Firebase Auth itself, not Firestore rules.

GitHub Pages deployment
-----------------------
1. Push this folder to a GitHub repository.
2. In the repository settings, open Pages.
3. Choose Deploy from a branch and select the main branch / root folder.
4. The site will be published at https://<username>.github.io/<repository>/.
5. No build step is required — Firebase and Chart.js are loaded from CDN script
   tags, exactly like the rest of this static site.

How to use
----------
1. Open the app and create an account. The first account becomes the administrator
   and is auto-approved; anyone after that sees a waiting screen until an admin
   approves them from Admin > Members (the Members tab shows a pending count).
2. Every member sets their own name, phone, and drop-off address in My Profile, and
   can update their account email or password from the same tab.
3. Admins assign delivery turns to eligible members from Assign Turns, and can
   approve/reject accounts, promote/demote admins, or toggle kidmat eligibility
   from Admin > Members.
4. Everyone browses the Directory, reorders it to their preferred route, saves it,
   and taps Navigate to get directions from their current location.
5. Members mark their own turns as delivered from My Turns; admins can also mark or
   delete any turn from Assign Turns.
6. The Leaderboard tracks turns taken and kidmat done for every eligible member.
