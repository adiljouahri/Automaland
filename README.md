# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

Since the Strapi configuration files are not part of this Tauri application's repository, I cannot write them directly. However, here are the exact steps you need to take on your Strapi Server.
You need to configure the Google Provider in Strapi to handle the OAuth flow that the desktop app initiates.
1. Update Google Cloud Console
Go to your Google Cloud Console for this project and ensure the Authorized redirect URI is set to your deployed Strapi domain:
https://YOUR-DEPLOYED-STRAPI-URL.com/api/connect/google/callback
(Note: It must end in /api/connect/google/callback, NOT the sidecar's localhost address).
2. Update Strapi Configuration
In your Strapi project files, create or edit config/plugins.js (or .ts if using TypeScript).
code
JavaScript
module.exports = ({ env }) => ({
  'users-permissions': {
    config: {
      providers: {
        google: {
          enabled: true,
          clientId: env('GOOGLE_CLIENT_ID'),
          clientSecret: env('GOOGLE_CLIENT_SECRET'),
          // CRITICAL: Set this to your production Strapi URL + callback
          // If you don't set this, Strapi might default to localhost causing mismatch errors.
          redirectUri: env('GOOGLE_REDIRECT_URI'), 
        },
      },
    },
  },
});
3. Update Strapi Environment Variables
In your Strapi server's .env file (or deployment environment variables settings), add the values from your Google JSON file:
code
Bash
GOOGLE_CLIENT_ID=your-client-id-from-json.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-from-json
GOOGLE_REDIRECT_URI=https://YOUR-DEPLOYED-STRAPI-URL.com/api/connect/google/callback
4. Verify Roles
Open your Strapi Admin Panel.
Go to Settings > Users & Permissions > Roles.
Select Public.
Scroll to Users-permissions > Auth.
Ensure callback and connect are checked (enabled).