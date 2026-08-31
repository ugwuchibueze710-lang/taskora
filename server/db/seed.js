// Development-only seed data. This is NEVER run automatically — it must be
// invoked explicitly with `npm run seed`, and it refuses to run against a
// database that already has real users, so it can't silently pollute a
// live production marketplace with fake accounts.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const CATEGORIES = [
  ['Handyman', '🔧'], ['Plumbing', '🚰'], ['Electrical', '💡'], ['Locksmith', '🔑'],
  ['Lawn Care', '🌱'], ['Landscaping', '🌳'], ['House Cleaning', '🧹'], ['Window Cleaning', '🪟'],
  ['Moving', '📦'], ['Painting', '🎨'], ['Roofing', '🏠'], ['HVAC', '❄️'],
  ['Appliance Repair', '🔌'], ['Home Improvement', '🛠️'], ['Carpentry', '🪚'], ['Furniture Assembly', '🪑'],
  ['Junk Removal', '🚛'], ['Pressure Washing', '💦'], ['Pest Control', '🐜'], ['Auto Services', '🚗'],
  ['Mobile Mechanic', '🔩'], ['Photography', '📷'], ['Videography', '🎥'], ['Beauty', '💅'],
  ['Hair', '💇'], ['Makeup', '💄'], ['Personal Training', '🏋️'], ['Tutoring', '📚'],
  ['Computer/IT', '💻'], ['Pet Services', '🐾'], ['Childcare', '🍼'], ['Senior Assistance', '🦯'],
  ['Delivery', '🚚'], ['Errands', '🏃'], ['Event Services', '🎉'], ['Wedding Services', '💍'],
  ['Music/Entertainment', '🎵'], ['Other / Custom Service', '✨'],
];

const SERVICES = {
  'House Cleaning': ['Standard House Cleaning', 'Deep Cleaning', 'Move-out Cleaning', 'Recurring Cleaning'],
  'Window Cleaning': ['Interior Window Cleaning', 'Exterior Window Cleaning', 'Gutter + Window Combo'],
  'Lawn Care': ['Mowing', 'Edging', 'Weed Control', 'Fertilizing'],
  Handyman: ['Furniture Assembly', 'TV Mounting', 'Drywall Repair', 'General Repairs'],
  Plumbing: ['Leak Repair', 'Drain Cleaning', 'Fixture Installation', 'Water Heater Service'],
  Electrical: ['Outlet Installation', 'Lighting Installation', 'Panel Upgrade', 'Ceiling Fan Installation'],
  Locksmith: ['Lockout Service', 'Lock Rekey', 'Lock Installation'],
  Moving: ['Local Moving', 'Furniture Moving', 'Packing Help'],
  'Furniture Assembly': ['IKEA Assembly', 'Bed Frame Assembly', 'Office Furniture Assembly'],
};

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const existingUsers = await client.query('SELECT count(*) FROM users');
  if (Number(existingUsers.rows[0].count) > 0) {
    console.log('Refusing to seed: this database already has real user accounts.');
    console.log('If this is genuinely a fresh dev database you want reseeded, wipe it first.');
    await client.end();
    return;
  }

  console.log('Seeding categories & services...');
  const categoryIds = {};
  for (const [i, [name, icon]] of CATEGORIES.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const { rows } = await client.query(
      `INSERT INTO categories (slug, name, icon, sort_order) VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [slug, name, icon, i]
    );
    categoryIds[name] = rows[0].id;
  }
  for (const [categoryName, services] of Object.entries(SERVICES)) {
    const categoryId = categoryIds[categoryName];
    if (!categoryId) continue;
    for (const svc of services) {
      const slug = svc.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await client.query(
        `INSERT INTO services (category_id, name, slug) VALUES ($1,$2,$3) ON CONFLICT (category_id, slug) DO NOTHING`,
        [categoryId, svc, slug]
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
    { first: 'Alex', last: 'Rivera', business: "Rivera's Cleaning Co.", categories: ['House Cleaning', 'Window Cleaning'], desc: 'Family-owned residential cleaning, 8 years serving the Owensboro area.' },
    { first: 'Sam', last: 'Chen', business: 'Chen Handyman Services', categories: ['Handyman', 'Furniture Assembly'], desc: 'Reliable handyman for repairs, assembly, and mounting.' },
    { first: 'Morgan', last: 'Blake', business: "Blake's Lawn & Landscape", categories: ['Lawn Care', 'Landscaping'], desc: 'Weekly mowing and full landscaping design.' },
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
       VALUES ($1,$2,$3,$4,'active',$5,$6,$7,25, now(), $8, $9, $10) RETURNING id`,
      [userId, p.business, `${p.first} ${p.last}`, p.desc, 'Owensboro, KY', 37.7742 + i * 0.02, -87.1133 - i * 0.02, 4.6 + i * 0.1, 12 + i * 4, 8 + i * 3]
    );
    const providerId = providerRows[0].id;
    await client.query('INSERT INTO provider_service_areas (provider_id, radius_miles) VALUES ($1, 25)', [providerId]);

    for (const catName of p.categories) {
      const catId = categoryIds[catName];
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
  console.log('  Providers: alex@taskora.test, sam@taskora.test, morgan@taskora.test / test1234');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
