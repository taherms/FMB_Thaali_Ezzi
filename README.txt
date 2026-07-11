FMB Thaali Ezzi Sector
======================

Overview
--------
This web app lets admins manage thaali details and lets every signed-in user view thaali records, open each location in Google Maps, and save their own preferred delivery order for future use.

Features
--------
- Firebase Authentication for sign in and sign up
- Admin access for adding, editing, and deleting thaali entries
- Each user can save their personal delivery route order
- Notices appear when new thaali data is added or a location changes
- Clicking the thaali name or location opens the location in Google Maps
- Modern, Fatemi Islamic-inspired design with a logo area that can use the FMB logo image

Firebase setup
--------------
1. Create a Firebase project.
2. Enable Email/Password authentication.
3. Enable Firestore Database.
4. Open js/firebase-config.js and replace the sample config with your project settings.
5. In Firestore, create these collections:
   - users
   - thaalis
   - userPreferences
   - settings

GitHub Pages deployment
-----------------------
1. Push this folder to a GitHub repository.
2. In the repository settings, open Pages.
3. Choose Deploy from a branch and select the main branch / root folder.
4. The site will be published at https://<username>.github.io/<repository>/.

How to use
----------
1. Open the app and create an account.
2. The first account becomes the administrator by default.
3. Admins add or update thaali records with name, person, location, role, volunteer, phone, and delivery days.
4. Every user can review the list, open locations on a map, and save their own delivery order.
5. If a new thaali is added or a location changes, the notice banner prompts everyone to review and save the order again.
