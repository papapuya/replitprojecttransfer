import { createAdminUser } from './supabase-auth';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('❌ ADMIN_EMAIL and ADMIN_PASSWORD environment variables must be set');
  console.error('Usage: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=securepass npm run create-admin');
  process.exit(1);
}

createAdminUser(email, password)
  .then(() => {
    console.log('✅ Admin user created successfully!');
    console.log(`Email: ${email}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  });
