import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const saltRounds = 12;

  // Admin account
  const adminPassword = await bcrypt.hash('Admin@123456', saltRounds);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@immotopia.com' },
    update: {},
    create: {
      email: 'admin@immotopia.com',
      password_hash: adminPassword,
      full_name: 'Administrateur Principal',
      role: UserRole.ADMIN,
      email_verified: true,
      is_active: true
    }
  });

  // Instructor account
  const instructorPassword = await bcrypt.hash('Instructor@123456', saltRounds);
  const instructor = await prisma.user.upsert({
    where: { email: 'instructeur@immotopia.com' },
    update: {},
    create: {
      email: 'instructeur@immotopia.com',
      password_hash: instructorPassword,
      full_name: 'Jean Dupont',
      role: UserRole.INSTRUCTOR,
      email_verified: true,
      is_active: true
    }
  });

  // Student account
  const studentPassword = await bcrypt.hash('Student@123456', saltRounds);
  const student = await prisma.user.upsert({
    where: { email: 'etudiant@immotopia.com' },
    update: {},
    create: {
      email: 'etudiant@immotopia.com',
      password_hash: studentPassword,
      full_name: 'Marie Martin',
      role: UserRole.STUDENT,
      email_verified: true,
      is_active: true
    }
  });

  console.log('Seed data created:', { admin, instructor, student });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

