<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/b9ee60ef-a370-4c0b-817a-1088053df870

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create a `.env.local` (see `.env.example`) and set:
   - `GEMINI_API_KEY`
   - Firebase web config (`NEXT_PUBLIC_FIREBASE_*`)
   - `NEXT_PUBLIC_FIRESTORE_DATABASE_ID`
3. Run the app:
   `npm run dev`
