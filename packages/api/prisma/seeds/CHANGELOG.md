# Seed Data Changelog

This document tracks all changes to seed data for the authentication module.

## Version 1.0.0 - 2025-11-12

**Initial seed data**

### Accounts Created

1. **Admin Account**
   - Email: `admin@immotopia.com`
   - Password: `Admin@123456`
   - Full Name: `Administrateur Principal`
   - Role: `ADMIN`
   - Email Verified: `true`
   - Status: `Active`

2. **Instructor Account**
   - Email: `instructeur@immotopia.com`
   - Password: `Instructor@123456`
   - Full Name: `Jean Dupont`
   - Role: `INSTRUCTOR`
   - Email Verified: `true`
   - Status: `Active`

3. **Student Account**
   - Email: `etudiant@immotopia.com`
   - Password: `Student@123456`
   - Full Name: `Marie Martin`
   - Role: `STUDENT`
   - Email Verified: `true`
   - Status: `Active`

### Notes

- All passwords are hashed using bcrypt with salt factor 12
- All accounts are pre-verified for testing purposes
- All accounts are active by default
- Passwords follow the security requirements: 8+ characters, uppercase, lowercase, number, special character

### Usage

To run the seed script:
```bash
npm run prisma:seed
```

To reset and reseed:
```bash
npx prisma migrate reset
npm run prisma:seed
```

