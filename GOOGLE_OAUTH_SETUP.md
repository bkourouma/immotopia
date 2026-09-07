# Google OAuth Setup & Testing Guide

## ✅ Credentials Added Successfully

Your Google OAuth credentials have been successfully configured:

```
Client ID: YOUR_GOOGLE_CLIENT_ID
Client Secret: YOUR_GOOGLE_CLIENT_SECRET
```

**Location:** `packages/api/.env`

---

## 🔄 Step 1: Restart Your Backend Server

Since environment variables are loaded at server startup, you need to restart the backend:

### Option 1: Using the start-dev.bat script
1. Close any existing terminal windows running the server
2. Double-click `start-dev.bat` in the project root
3. This will automatically restart both backend and frontend

### Option 2: Manual restart
1. Find the backend terminal window (should show "Standard App Backend")
2. Press `Ctrl+C` to stop the server
3. Navigate to `packages/api`
4. Run: `npm run dev`

### Verify the server started correctly
Check the console output - you should **NOT** see this warning:
```
⚠️ Google OAuth credentials not found. Google login will be disabled.
```

If you see that warning, the credentials weren't loaded properly.

---

## 🧪 Step 2: Test Google OAuth Integration

### Method 1: Use the Test Page (Recommended)

I've created a beautiful test page for you:

1. **Open the test page:**
   - Navigate to: `d:\APP\Immobillier\test-google-oauth.html`
   - Double-click to open in your browser
   - OR run: `start test-google-oauth.html` from the project directory

2. **What you should see:**
   - A nice purple gradient page with "Google OAuth Test"
   - A "Sign in with Google" button
   - A status indicator showing if the server is running
   - Information about what happens during the OAuth flow

3. **Click the "Sign in with Google" button:**
   - You'll be redirected to Google's login page
   - Sign in with your Google account
   - Grant permissions to the Immobillier app
   - You should be redirected back to your app

### Method 2: Direct Browser Navigation

1. Simply open your browser and navigate to:
   ```
   http://localhost:8000/api/auth/google
   ```

2. This should immediately redirect you to Google's OAuth consent screen

### Method 3: cURL Test

```bash
curl -v http://localhost:8000/api/auth/google
```

You should see a 302 redirect to `accounts.google.com`

---

## 🔍 What Should Happen

### Expected OAuth Flow:

1. **User clicks "Sign in with Google"**
   - Redirects to: `http://localhost:8000/api/auth/google`

2. **Backend processes the request**
   - Passport.js middleware kicks in
   - Redirects to Google's OAuth consent screen

3. **User authenticates with Google**
   - Google displays app name: "Immobillier"
   - Requests permissions: email, profile

4. **Google redirects back to your app**
   - Callback URL: `http://localhost:8000/api/auth/google/callback`
   - Includes authorization code

5. **Backend processes the callback**
   - Exchanges code for user profile
   - Creates or updates user in database
   - Generates JWT access & refresh tokens
   - Sets secure HTTP-only cookies

6. **User is redirected to frontend**
   - Redirects to: `http://localhost:3000/auth/callback?success=true`
   - User is now logged in!

---

## 🔐 Security Features Implemented

✅ **HTTP-Only Cookies** - Tokens stored securely, not accessible via JavaScript  
✅ **Secure Flag** - Cookies only sent over HTTPS in production  
✅ **SameSite Protection** - CSRF protection  
✅ **Email Verification** - Auto-verified for Google sign-ins  
✅ **Account Merging** - Links Google account to existing email accounts

---

## 🐛 Troubleshooting

### Issue: "Google OAuth credentials not found" warning

**Solution:** 
- Verify the `.env` file contains the credentials
- Restart the backend server
- Check that you're in the correct directory

### Issue: "Redirect URI mismatch" error from Google

**Solution:**
- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Navigate to: APIs & Services → Credentials
- Edit your OAuth 2.0 Client ID
- Add these authorized redirect URIs:
  - `http://localhost:8000/api/auth/google/callback`
  - `http://localhost:3000/api/auth/google/callback` (if needed)

### Issue: Server not responding on port 8000

**Solution:**
- Check if another process is using port 8000
- Run: `netstat -ano | findstr :8000`
- Kill the process or change the PORT in `.env`

### Issue: CORS errors in browser console

**Solution:**
- Check `CLIENT_URL` in `.env` matches your frontend URL
- Verify `cors-middleware.ts` allows your origin
- Default allowed origin: `http://localhost:3001`

---

## 📝 Environment Variables Reference

Your current configuration in `packages/api/.env`:

```env
# Server
PORT=8000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/immobillier"

# JWT
JWT_SECRET="changeme_in_production_secret_key_12345"
JWT_EXPIRES_IN="7d"

# Google OAuth ✅ CONFIGURED
GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
GOOGLE_CALLBACK_URL="http://localhost:8000/api/auth/google/callback"

# Frontend
CLIENT_URL="http://localhost:3001"
```

---

## 🚀 Next Steps

1. ✅ Credentials added
2. ⏳ Restart backend server
3. ⏳ Open test page and click "Sign in with Google"
4. ⏳ Verify successful login
5. ⏳ Test account creation/login in database
6. ⏳ Integrate Google login button in your frontend

---

## 📚 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/google` | GET | Initiates Google OAuth flow |
| `/api/auth/google/callback` | GET | Handles Google OAuth callback |
| `/api/auth/me` | GET | Get current user (requires auth) |
| `/api/auth/logout` | POST | Logout user |
| `/api/auth/refresh` | POST | Refresh access token |

---

## 🎨 Frontend Integration Example

When you're ready to add Google login to your React frontend:

```tsx
const GoogleLoginButton = () => {
  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:8000/api/auth/google';
  };

  return (
    <button onClick={handleGoogleLogin}>
      <GoogleIcon />
      Sign in with Google
    </button>
  );
};
```

---

**🎉 Your Google OAuth is configured and ready to test!**

Open `test-google-oauth.html` to begin testing.
