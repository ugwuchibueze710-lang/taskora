// Development-only seed data. This is NEVER run automatically — it must be
// invoked explicitly with `npm run seed`, and it refuses to run against a
// database that already has real users, so it can't silently pollute a
// live production marketplace with fake accounts.
//
// The category catalog itself is NOT duplicated here — it's synced from the
// single central data file (server/src/data/categories.data.js) via
// syncCategoryCatalog(), the exact same function the server calls on every
// boot. This script only adds demo USER/PROVIDER accounts on top of it.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { syncCategoryCatalog } from '../src/services/category.service.js';

// A few finer-grained sub-services under some demo providers' categories,
// purely for demoing the optional "specific services" layer.
const DEMO_SUB_SERVICES = {
  'home-cleaning': ['Standard House Cleaning', 'Recurring Cleaning'],
  'window-cleaning': ['Interior Window Cleaning', 'Exterior Window Cleaning'],
  handyman: ['General Repairs', 'Drywall Repair'],
  'furniture-assembly': ['IKEA Assembly', 'Bed Frame Assembly'],
  'lawn-mowing': ['Weekly Mowing', 'Edging'],
  landscaping: ['Landscape Design'],
};

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const existingUsers = await client.query('SELECT count(*) FROM users');
  if (Number(existingUsers.rows[0].count) > 0) {
    console.log('Refusing to seed demo accounts: this database already has real user accounts.');
    console.log('Category catalog sync is safe to run regardless, so running that now...');
    await client.end();
    await syncCategoryCatalog();
    return;
  }

  console.log('Syncing category catalog...');
  await syncCategoryCatalog();

  const catIdBySlug = {};
  const { rows: catRows } = await client.query('SELECT id, slug FROM categories');
  for (const row of catRows) catIdBySlug[row.slug] = row.id;

  for (const [slug, names] of Object.entries(DEMO_SUB_SERVICES)) {
    const categoryId = catIdBySlug[slug];
    if (!categoryId) continue;
    for (const name of names) {
      const svcSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await client.query(
        `INSERT INTO services (category_id, name, slug) VALUES ($1,$2,$3) ON CONFLICT (category_id, slug) DO NOTHING`,
        [categoryId, name, svcSlug]
      );
    }
  }

  console.log('Seeding [TEST DATA] accounts...');
  const passwordHash = await bcrypt.hash('test1234', 10);

  const { rows: adminRows } = await client.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1,$2,$3,$4,'admin') RETURNING id`,
    ['Taskora', 'Admin', 'admin@taskora.test', passwordHash]
  );
  await client.query('INSERT INTO profiles (user_id) VALUES ($1)', [adminRows[0].id]);
  await client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [adminRows[0].id]);

  const { rows: customerRows } = await client.query(
    `INSERT INTO users (first_name, last_name, email, password_hash) VALUES ($1,$2,$3,$4) RETURNING id`,
    ['Jamie', 'Customer', 'customer@taskora.test', passwordHash]
  );
  await client.query('INSERT INTO profiles (user_id, location_label, location_lat, location_lng) VALUES ($1,$2,$3,$4)', [
    customerRows[0].id, 'Owensboro, KY', 37.7742, -87.1133,
  ]);
  await client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [customerRows[0].id]);

  const providerSeeds = [
    { first: 'Alex', last: 'Rivera', business: "Rivera's Cleaning Co.", categorySlugs: ['home-cleaning', 'window-cleaning'], desc: 'Family-owned residential cleaning, 8 years serving the Owensboro area.', radius: 25 },
    { first: 'Sam', last: 'Chen', business: 'Chen Handyman Services', categorySlugs: ['handyman', 'furniture-assembly'], desc: 'Reliable handyman for repairs, assembly, and mounting.', radius: 20 },
    { first: 'Morgan', last: 'Blake', business: "Blake's Lawn & Landscape", categorySlugs: ['lawn-mowing', 'landscaping'], desc: 'Weekly mowing and full landscaping design.', radius: 30 },
    { first: 'Jordan', last: 'Reyes', business: "Reyes Locksmith & Security", categorySlugs: ['locksmith', 'home-security'], desc: 'Licensed locksmith — lockouts, rekeys, and security installs.', radius: 40 },
  ];

  for (const [i, p] of providerSeeds.entries()) {
    const email = `${p.first.toLowerCase()}@taskora.test`;
    const { rows: userRows } = await client.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, current_mode) VALUES ($1,$2,$3,$4,'provider') RETURNING id`,
      [p.first, p.last, email, passwordHash]
    );
    const userId = userRows[0].id;
    await client.query('INSERT INTO profiles (user_id, location_label, location_lat, location_lng) VALUES ($1,$2,$3,$4)', [
      userId, 'Owensboro, KY', 37.7742 + i * 0.02, -87.1133 - i * 0.02,
    ]);
    await client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [userId]);

    const { rows: providerRows } = await client.query(
      `INSERT INTO providers (user_id, business_name, display_name, description, status, base_location_label, base_lat, base_lng, service_radius_miles, published_at, rating_avg, rating_count, completed_jobs_count)
       VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8, now(), $9, $10, $11) RETURNING id`,
      [userId, p.business, `${p.first} ${p.last}`, p.desc, 'Owensboro, KY', 37.7742 + i * 0.02, -87.1133 - i * 0.02, p.radius, 4.6 + i * 0.1, 12 + i * 4, 8 + i * 3]
    );
    const providerId = providerRows[0].id;
    await client.query('INSERT INTO provider_service_areas (provider_id, radius_miles) VALUES ($1, $2)', [providerId, p.radius]);

    for (const slug of p.categorySlugs) {
      const catId = catIdBySlug[slug];
      if (!catId) continue;
      await client.query('INSERT INTO provider_categories (provider_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [
        providerId, catId,
      ]);
      const svcRes = await client.query('SELECT id FROM services WHERE category_id = $1', [catId]);
      for (const svc of svcRes.rows) {
        await client.query('INSERT INTO provider_services (provider_id, service_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [
          providerId, svc.id,
        ]);
      }
    }
  }

  console.log('Seed complete:');
  console.log('  Admin:    admin@taskora.test / test1234');
  console.log('  Customer: customer@taskora.test / test1234');
  console.log('  Providers: alex@taskora.test, sam@taskora.test, morgan@taskora.test, jordan@taskora.test / test1234');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
